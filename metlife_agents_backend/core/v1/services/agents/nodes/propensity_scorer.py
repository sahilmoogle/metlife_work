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
from core.v1.services.agents.state import create_log_entry
from utils.v1.db_sync import sync_lead_state

logger = logging.getLogger(__name__)

NODE_ID = "A8_Scoring"


async def propensity_scorer(state: dict, *, db=None) -> dict:
    """Update the engagement score and determine routing."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    # ── Score increment based on email send ──────────────────────────
    email_number = state.get("email_number", 0)

    if email_number > 0:
        delta = calculate_score_delta("email_sent")
        state["engagement_score"] = round(state.get("engagement_score", 0.0) + delta, 4)

    state["current_node"] = NODE_ID

    # ── Write updated score back to the Lead table ───────────────────
    if db is not None:
        workflow_status = "Active"
        score = state["engagement_score"]
        threshold = state.get("handoff_threshold", 0.80)
        if score >= threshold:
            workflow_status = (
                "Active"  # handoff pending — stay Active until G4 resolves
            )

        await sync_lead_state(
            db,
            lead_id,
            engagement_score=state["engagement_score"],
            current_agent_node=NODE_ID,
            workflow_status=workflow_status,
        )

    score = state["engagement_score"]
    threshold = state.get("handoff_threshold", 0.80)
    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "A8 scored lead %s → %.4f (threshold=%.2f) in %dms",
        lead_id,
        score,
        threshold,
        latency_ms,
    )
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"score={score:.4f} threshold={threshold:.2f} {latency_ms}ms",
        )
    )

    route_hint = (
        "↑ handoff ready"
        if score >= threshold
        else ("⚡ edge zone" if score >= threshold - 0.10 else "→ continue nurture")
    )
    state["execution_log"] = [
        create_log_entry(
            title=f"A8 - PROPENSITY SCORER · COMPLETED (Email #{state.get('email_number', 0)})",
            description=(
                f"Score: {score:.2f} / Threshold: {threshold:.2f} — {route_hint}"
            ),
            badges=["Rule-Based", "Scoring Engine"],
        )
    ]
    return state
