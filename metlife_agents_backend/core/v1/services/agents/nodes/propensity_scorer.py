"""
Propensity Scorer (A8) — rule-based engagement scoring engine.

Increments the lead's engagement score based on the most recent
interaction event.  At Tier 3 this will be swapped for an ML model.
"""

from __future__ import annotations

import logging
import time

from core.v1.services.agents.rules.scoring_rules import (
    calculate_score_delta,
)
from core.v1.services.sse.manager import event_manager, node_transition_event

logger = logging.getLogger(__name__)

NODE_ID = "A8_Scoring"


async def propensity_scorer(state: dict) -> dict:
    """Update the engagement score and determine routing."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    # ── Score increment based on latest event ────────────────────────
    # In production, this reads from EmailEvent table.
    # For the core engine, we apply a send-based delta.
    email_number = state.get("email_number", 0)

    if email_number > 0:
        delta = calculate_score_delta("email_sent")
        state["engagement_score"] = round(state.get("engagement_score", 0.0) + delta, 4)

    # ── S4 re-segmentation check ─────────────────────────────────────
    scenario = state.get("scenario")
    if scenario == "S4" and email_number == 1:
        # After first revival email, score reflects initial send only
        pass

    state["current_node"] = NODE_ID

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "A8 scored lead %s → %.4f (threshold=%.2f) in %dms",
        lead_id,
        state["engagement_score"],
        state.get("handoff_threshold", 0.80),
        latency_ms,
    )
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"score={state['engagement_score']:.4f} {latency_ms}ms",
        )
    )

    return state
