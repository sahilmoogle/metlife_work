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
from core.v1.services.agents.state import create_log_entry

logger = logging.getLogger(__name__)

NODE_ID = "A10_Dormancy"


async def dormancy_agent(state: dict) -> dict:
    """Assign a P1/P2/P3 revival segment for dormant leads."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    # ── Re-use existing segment if already assigned ───────────────────
    # This allows the dormancy scan to preserve a segment set on the Lead row.
    existing_segment = state.get("revival_segment")

    if existing_segment in ("P1", "P2", "P3"):
        segment = existing_segment
    else:
        # ── Derive web-behaviour signals from internal engagement_score ─
        # engagement_score is written by A8 from email_events in the DB.
        # This acts as a proxy for web behaviour until web_events are populated:
        #   0.0        → P1 (no engagement at all)
        #   0.01–0.19  → P2 (some opens, no product-page clicks)
        #   0.20+      → P3 (product/sim pages clicked)
        score = state.get("engagement_score", 0.0)
        has_website_visits = score > 0.0
        has_product_views = score >= 0.20

        segment = classify_dormant_segment(
            has_website_visits=has_website_visits,
            has_product_views=has_product_views,
        )

    state["revival_segment"] = segment
    state["scenario"] = "S4"

    # G3 Campaign Approval is mandatory for S4
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

    state["execution_log"] = [
        create_log_entry(
            title="A10 - DORMANCY AGENT · COMPLETED — Awaiting G3 Campaign Approval",
            description=(
                f"Revival segment: {segment}  "
                f"({'existing segment preserved' if existing_segment in ('P1', 'P2', 'P3') else 'derived from engagement_score'})"
            ),
            badges=["S4 Revival", f"Segment {segment}", "G3 · Pending"],
        )
    ]
    return state
