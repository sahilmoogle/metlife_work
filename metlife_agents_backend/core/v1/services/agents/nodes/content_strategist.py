"""
Content Strategist (A4) — determines the email theme and strategy
based on scenario, intent, and email sequence position.

For Email #1: selects a pre-approved existing asset (no LLM).
For Emails #2–5: uses A3 intent to derive the content theme for A5.
"""

from __future__ import annotations

import logging
import time

from core.v1.services.sse.manager import event_manager, node_transition_event

logger = logging.getLogger(__name__)

NODE_ID = "A4_ContentStrategy"


async def content_strategist(state: dict, *, db=None) -> dict:
    """Decide the email content strategy for the current sequence step."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    email_number = state.get("email_number", 0) + 1
    state["email_number"] = email_number
    scenario = state.get("scenario", "S1")

    if email_number == 1:
        # ── Email #1 — always an existing pre-approved asset ─────────
        state["content_type"] = "existing_asset"

        # Asset selection is based on scenario + persona
        if scenario == "S5":
            state["draft_email_subject"] = "[MetLife] 3つの保険プランをご比較ください"
            state["draft_email_body"] = (
                "3-CTA comparison email: Medical Insurance / "
                "Life Insurance / Asset Formation"
            )
        elif scenario == "S4":
            segment = state.get("revival_segment", "P1")
            state["draft_email_subject"] = f"[MetLife] {segment} Revival Campaign"
            state["draft_email_body"] = f"Pre-approved {segment} segment revival asset."
        else:
            name = state.get("first_name") or "お客様"
            state["draft_email_subject"] = f"[MetLife] {name}様、保険のご案内"
            state["draft_email_body"] = (
                f"Welcome email for scenario {scenario}. "
                f"Pre-approved brand asset with name personalisation."
            )
    else:
        # ── Emails #2–5 — LLM-generated content (handled by A5) ─────
        state["content_type"] = "llm_generated"
        # A5 will populate draft_email_subject and draft_email_body

    state["current_node"] = NODE_ID

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "A4 strategy for lead %s email #%d in %dms", lead_id, email_number, latency_ms
    )
    await event_manager.publish(
        node_transition_event(
            lead_id, NODE_ID, "completed", f"email#{email_number} {latency_ms}ms"
        )
    )

    return state
