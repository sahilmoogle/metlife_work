"""
Dormancy Agent (A10) — batch-triggered revival scan.

Identifies leads dormant > 180 days and assigns them
to P1/P2/P3 segments for the S4 Dormant Revival workflow.
"""

from __future__ import annotations

import logging
import time

from core.v1.services.agents.rules.scoring_rules import classify_dormant_segment
from core.v1.services.sse.manager import event_manager, node_transition_event

logger = logging.getLogger(__name__)

NODE_ID = "A10_Dormancy"


async def dormancy_agent(state: dict) -> dict:
    """Assign a P1/P2/P3 revival segment for dormant leads."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    # ── Segment assignment ───────────────────────────────────────────
    # In production, this queries Adobe Analytics for 6-month behaviour.
    # For the core engine, we use flags on the state.
    segment = classify_dormant_segment(
        has_website_visits=False,  # populated from analytics in production
        has_product_views=False,
    )

    state["revival_segment"] = segment
    state["scenario"] = "S4"

    # ── G3 Campaign Approval is mandatory for S4 ─────────────────────
    state["hitl_gate"] = "G3"
    state["hitl_status"] = "pending"
    state["current_node"] = NODE_ID

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("A10 segment=%s for lead %s in %dms", segment, lead_id, latency_ms)
    await event_manager.publish(
        node_transition_event(
            lead_id, NODE_ID, "completed", f"{segment} {latency_ms}ms"
        )
    )

    return state
