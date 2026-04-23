"""
Content Strategist (A4) — determines the email theme and strategy
based on scenario, intent, and email sequence position.

Blueprint rules (MetLife_JP_Flows.html):
  Email #1 for S1–S4: pre-approved existing asset (no LLM).
  Email #1 for S5:    existing 3-CTA comparison asset (no LLM).
  Email #1 for S6:    LLM-generated from MEMO (pre-consultation confirmation).
  Email #1 for S7:    LLM-generated from call notes MEMO (post-call follow-up).
  Emails #2–5:        LLM-generated content (via A5 generative_writer).
"""

from __future__ import annotations

import logging
import time

from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry
from utils.v1.db_sync import sync_lead_state

logger = logging.getLogger(__name__)

NODE_ID = "A4_ContentStrategy"

# Scenarios where Email #1 is always LLM-generated (MEMO-based, no pre-approved asset)
LLM_FIRST_EMAIL_SCENARIOS = ("S6", "S7")


async def content_strategist(state: dict, *, db=None) -> dict:
    """Decide the email content strategy for the current sequence step."""
    lead_id = state["lead_id"]
    await event_manager.publish(
        node_transition_event(lead_id, NODE_ID, "started", batch_id=state.get("batch_id"))
    )
    start = time.perf_counter()

    email_number = state.get("email_number", 0) + 1
    state["email_number"] = email_number
    scenario = state.get("scenario", "S1")

    # For G1 rejection on an existing asset, force LLM regeneration
    if (
        email_number == 1
        and state.get("content_type") == "existing_asset"
        and state.get("hitl_resume_value") == "rejected"
    ):
        state["content_type"] = "llm_generated"
        state["current_node"] = NODE_ID
        await event_manager.publish(
            node_transition_event(
                lead_id, NODE_ID, "completed", f"email#{email_number} rejected→LLM"
                ,
                batch_id=state.get("batch_id"),
            )
        )
        return state

    if email_number == 1:
        # ── S6/S7: first email is always LLM-generated (MEMO context) ──
        if scenario in LLM_FIRST_EMAIL_SCENARIOS:
            state["content_type"] = "llm_generated"
            state["draft_email_subject"] = None  # A5 will populate
            state["draft_email_body"] = None

        # ── S5: existing 3-CTA comparison asset ──────────────────────
        elif scenario == "S5":
            state["content_type"] = "existing_asset"
            state["draft_email_subject"] = "[MetLife] 3つの保険プランをご比較ください"
            state["draft_email_body"] = (
                "3-CTA comparison email: Medical Insurance / "
                "Life Insurance / Asset Formation. "
                "CTAクリックにより商品カテゴリを選択できます。"
            )

        # ── S4: revival asset by P1/P2/P3 segment ────────────────────
        elif scenario == "S4":
            segment = state.get("revival_segment", "P1")
            state["content_type"] = "existing_asset"
            state["draft_email_subject"] = f"[MetLife] {segment} Revival Campaign"
            state["draft_email_body"] = f"Pre-approved {segment} segment revival asset."

        # ── S1–S3: standard welcome asset personalised by name ───────
        else:
            name = state.get("first_name") or "お客様"
            state["content_type"] = "existing_asset"
            state["draft_email_subject"] = f"[MetLife] {name}様、保険のご案内"
            state["draft_email_body"] = (
                f"Welcome email for scenario {scenario}. "
                f"Pre-approved brand asset with name personalisation."
            )

    else:
        # ── Emails #2–5: LLM-generated content (handled by A5) ───────
        state["content_type"] = "llm_generated"
        state["draft_email_subject"] = None
        state["draft_email_body"] = None

    state["current_node"] = NODE_ID
    if db is not None:
        await sync_lead_state(db, lead_id, current_agent_node=NODE_ID, workflow_status="Active")

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "A4 strategy for lead %s email #%d (%s) in %dms",
        lead_id,
        email_number,
        state["content_type"],
        latency_ms,
    )
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"email#{email_number} {state['content_type']} {latency_ms}ms",
            batch_id=state.get("batch_id"),
        )
    )

    state["execution_log"] = [
        create_log_entry(
            title=f"A4 - CONTENT STRATEGIST · COMPLETED (Email #{email_number})",
            description=f"Scenario {scenario} → content_type={state['content_type']}",
            badges=[
                "Rule-Based"
                if state["content_type"] == "existing_asset"
                else "LLM Strategy"
            ],
        )
    ]

    return state
