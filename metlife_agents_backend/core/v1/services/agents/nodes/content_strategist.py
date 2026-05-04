"""
Content Strategist (A4) — determines the email theme and strategy
based on scenario, intent, and email sequence position.

Blueprint rules (MetLife_JP_Flows.html):
  Email #1 for S1–S5: pre-approved existing asset from email_templates table.
                       Falls back to hardcoded placeholder when DB has no template.
  Email #1 for S6:    LLM-generated from MEMO (pre-consultation confirmation).
  Email #1 for S7:    LLM-generated from call notes MEMO (post-call follow-up).
  Emails #2–5:        LLM-generated content (via A5 generative_writer),
                      optionally using DB templates as style reference.
"""

from __future__ import annotations

import logging
import time

from sqlalchemy import select

from model.database.v1.emails import EmailTemplate
from core.v1.services.agents.rules.scoring_rules import classify_dormant_segment
from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry
from utils.v1.db_sync import sync_lead_state

logger = logging.getLogger(__name__)

NODE_ID = "A4_ContentStrategy"

# Scenarios where Email #1 is always LLM-generated (MEMO-based, no pre-approved asset)
LLM_FIRST_EMAIL_SCENARIOS = ("S6", "S7")

# S4 revival templates are no longer seeded as inline placeholders — all DB templates
# are real approved assets.  Keep this as an empty set so the guard at line 120
# is a no-op and no DB template is skipped.
INLINE_ONLY_TEMPLATE_NAMES: frozenset[str] = frozenset()


async def content_strategist(state: dict, *, db=None) -> dict:
    """Decide the email content strategy for the current sequence step."""
    lead_id = state["lead_id"]
    await event_manager.publish(
        node_transition_event(
            lead_id, NODE_ID, "started", batch_id=state.get("batch_id")
        )
    )
    start = time.perf_counter()

    is_g1_rejection = (
        state.get("hitl_gate") == "G1"
        and state.get("hitl_resume_value") == "rejected"
        and state.get("email_number", 0) > 0
    )
    email_number = (
        state.get("email_number", 0)
        if is_g1_rejection
        else state.get("email_number", 0) + 1
    )
    state["email_number"] = email_number
    scenario = state.get("scenario", "S1")
    language = str(state.get("target_language") or "JA").upper()

    if scenario == "S5" and email_number > 1 and not state.get("product_interest"):
        state["product_interest"] = "medical_insurance"

    if scenario == "S4" and email_number > 1:
        base_score = float(state.get("base_score") or 0.0)
        engagement_score = float(state.get("engagement_score") or base_score)
        delta = round(engagement_score - base_score, 4)
        resegmented = classify_dormant_segment(
            has_website_visits=delta > 0.05,
            has_product_views=delta >= 0.35,
        )
        if resegmented != state.get("revival_segment"):
            logger.info(
                "A4 re-segmented S4 lead %s before email #%d: %s -> %s",
                lead_id,
                email_number,
                state.get("revival_segment"),
                resegmented,
            )
        state["revival_segment"] = resegmented

    # G1 rejection revises the current email; it must not advance the sequence.
    if is_g1_rejection:
        state["content_type"] = "llm_generated"
        state["draft_email_subject"] = None
        state["draft_email_body"] = None
        state["current_node"] = NODE_ID

    if not is_g1_rejection and email_number == 1:
        # ── S6/S7: first email is always LLM-generated (MEMO context) ──
        if scenario in LLM_FIRST_EMAIL_SCENARIOS:
            state["content_type"] = "llm_generated"
            state["draft_email_subject"] = None  # A5 will populate
            state["draft_email_body"] = None

        else:
            # ── S1–S5: look up pre-approved brand asset from DB ───────
            # S4 revival emails are keyed by revival_segment (P1/P2/P3) stored
            # in product_code so each segment gets its own campaign asset.
            db_template = None
            if db is not None:
                query = (
                    select(EmailTemplate)
                    .where(EmailTemplate.scenario_id == scenario)
                    .where(EmailTemplate.is_active == True)  # noqa: E712
                    .where(EmailTemplate.version == 1)
                    .where(EmailTemplate.language == language)
                )
                if scenario == "S4":
                    segment = state.get("revival_segment", "P1")
                    query = query.where(EmailTemplate.product_code == segment)
                result = await db.execute(query.limit(1))
                db_template = result.scalar_one_or_none()

            if db_template:
                # Inline-only seeded templates are not treated as approved assets anymore.
                if db_template.template_name in INLINE_ONLY_TEMPLATE_NAMES:
                    logger.info(
                        "A4 ignoring inline-only template for lead %s: %s",
                        lead_id,
                        db_template.template_name,
                    )
                    db_template = None

            if db_template:
                name = state.get("first_name") or "お客様"
                state["content_type"] = "existing_asset"
                state["draft_email_subject"] = db_template.subject
                state["draft_email_subject_en"] = (
                    db_template.subject_en
                )  # EN label for operator UI
                # Personalise the {{FIRST_NAME}} placeholder in the template body
                state["draft_email_body"] = db_template.body_html.replace(
                    "{{FIRST_NAME}}", name
                )
                state["template_name"] = db_template.template_name
            else:
                # No approved file-backed template -> route to A5 LLM generation.
                state["content_type"] = "llm_generated"
                state["draft_email_subject"] = None
                state["draft_email_body"] = None

    else:
        # ── LLM-generated content path (retries or emails #2-5) ───────
        state["content_type"] = "llm_generated"
        state["draft_email_subject"] = None
        state["draft_email_body"] = None

        # Fetch the email-#N template from DB as a style reference for A5
        if db is not None:
            query = (
                select(EmailTemplate)
                .where(EmailTemplate.scenario_id == scenario)
                .where(EmailTemplate.is_active == True)  # noqa: E712
                .where(EmailTemplate.version == email_number)
                .where(EmailTemplate.language == language)
            )
            if scenario == "S5" and state.get("product_interest"):
                query = query.where(
                    EmailTemplate.product_code == state["product_interest"]
                )
            if scenario == "S4":
                query = query.where(
                    EmailTemplate.product_code == state.get("revival_segment", "P1")
                )
            result = await db.execute(query.limit(1))
            ref_template = result.scalar_one_or_none()
            if ref_template:
                # Provide A5 with real HTML structure reference so generated drafts
                # can mirror brand layout instead of only subject-line style.
                state["template_style_reference"] = (
                    ref_template.body_html[:3000]
                    if ref_template.body_html
                    else ref_template.subject
                )
                state["template_name"] = ref_template.template_name

    state["current_node"] = NODE_ID
    if db is not None:
        await sync_lead_state(
            db, lead_id, current_agent_node=NODE_ID, workflow_status="Active"
        )

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
