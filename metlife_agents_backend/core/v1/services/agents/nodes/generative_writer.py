"""
Generative Writer (A5) — drafts personalised email content.

For Email #1: passes through the pre-approved asset from A4.
For Emails #2–5: calls GPT-4 with keigo / language constraints.
"""

from __future__ import annotations

import json
import logging
import time

from sqlalchemy.ext.asyncio import AsyncSession

from prompts.writer import (
    A4A5_WRITER_SYSTEM,
    A4A5_WRITER_USER,
    COMMON_LLM_EMAIL_HTML_TEMPLATE,
)
from core.v1.services.agents.rules.scenario_rules import SCENARIO_DEFAULTS
from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry
from utils.v1.db_sync import sync_lead_state
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

NODE_ID = "A5_Writer"


async def generative_writer(
    state: dict, *, llm=None, db: AsyncSession | None = None
) -> dict:
    """Generate or pass through email content."""
    lead_id = state["lead_id"]
    await event_manager.publish(
        node_transition_event(
            lead_id, NODE_ID, "started", batch_id=state.get("batch_id")
        )
    )
    start = time.perf_counter()

    content_type = state.get("content_type", "existing_asset")

    if content_type == "existing_asset":
        # Email #1 — asset already set by A4, nothing to generate
        logger.info("A5 pass-through for lead %s (existing asset)", lead_id)
    elif llm is not None:
        # ── LLM generation for emails #2–5 ───────────────────────────
        scenario = state.get("scenario", "S1")
        config = SCENARIO_DEFAULTS.get(scenario, SCENARIO_DEFAULTS["S1"])

        system_msg = A4A5_WRITER_SYSTEM.format(
            target_language=state.get("target_language", "JA"),
            keigo_level=state.get("keigo_level", "casual"),
            tone=config.get("tone", "casual"),
            scenario_name=config.get("name", "General"),
            email_number=state.get("email_number", 1),
            max_emails=state.get("max_emails", 5),
            product_interest=state.get("product_interest", "general"),
            template_style_reference=state.get(
                "template_style_reference", "insurance nurturing email"
            ),
            common_html_template=COMMON_LLM_EMAIL_HTML_TEMPLATE,
        )

        user_msg = A4A5_WRITER_USER.format(
            first_name=state.get("first_name", ""),
            last_name=state.get("last_name", ""),
            age=state.get("age", "unknown"),
            scenario=scenario,
            intent_summary=state.get("intent_summary", ""),
            product_interest=state.get("product_interest", "general"),
            pain_points="",
            previous_topics="",
        )

        try:
            response = await llm.ainvoke(
                [
                    SystemMessage(content=system_msg),
                    HumanMessage(content=user_msg),
                ]
            )
            raw = response if isinstance(response, str) else response.content
            parsed = json.loads(raw)
            state["draft_email_subject"] = parsed.get("subject", "")
            state["draft_email_body"] = parsed.get("body", "")
            state["hitl_reviewer_notes"] = json.dumps(
                parsed.get("compliance_checklist", [])
            )
        except Exception as exc:
            logger.error("A5 LLM generation failed for lead %s: %s", lead_id, exc)
            raise RuntimeError("LLM email generation failed.") from exc
    else:
        # Azure OpenAI not configured — deterministic placeholder so local demo / HITL tests proceed.
        if state.get("draft_email_subject") and state.get("draft_email_body"):
            logger.info("A5 reusing existing draft for lead %s (no LLM)", lead_id)
        else:
            scenario = state.get("scenario", "S1")
            n = state.get("email_number", 1)
            product = str(state.get("product_interest") or "general").replace("_", " ")
            subject = f"[Demo] {scenario} {product} touch #{n}"
            state["draft_email_subject"] = subject
            state["draft_email_body"] = _render_placeholder_email(
                subject=subject,
                first_name=state.get("first_name") or "お客様",
                product_interest=product,
                intent_summary=state.get("intent_summary")
                or "保険への関心が高まっています。",
            )
            logger.warning(
                "A5 placeholder email for lead %s (LLM not configured, content_type=%s)",
                lead_id,
                content_type,
            )

    state["current_node"] = NODE_ID

    if db is not None:
        await sync_lead_state(
            db,
            state["lead_id"],
            current_agent_node=NODE_ID,
            workflow_status="Active",
        )

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("A5 completed for lead %s in %dms", lead_id, latency_ms)
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"{latency_ms}ms",
            batch_id=state.get("batch_id"),
        )
    )

    used_placeholder = content_type != "existing_asset" and llm is None
    content_label = (
        "existing_asset"
        if content_type == "existing_asset"
        else ("placeholder (no LLM)" if used_placeholder else "LLM-generated")
    )
    state["execution_log"] = [
        create_log_entry(
            title=f"A5 - GENERATIVE WRITER · COMPLETED (Email #{state.get('email_number', 1)})",
            description=(
                f"{content_label} — Subject: {str(state.get('draft_email_subject', ''))[:60]}"
            ),
            badges=["Pass-through"]
            if content_type == "existing_asset"
            else (
                ["Demo", "Placeholder"] if used_placeholder else ["LLM", "Azure OpenAI"]
            ),
        )
    ]
    return state


def _render_placeholder_email(
    *,
    subject: str,
    first_name: str,
    product_interest: str,
    intent_summary: str,
) -> str:
    """Render the common HTML shell when no LLM is configured locally."""
    return (
        COMMON_LLM_EMAIL_HTML_TEMPLATE.replace("{{SUBJECT}}", subject)
        .replace("{{PREHEADER}}", intent_summary[:110])
        .replace("{{MIRROR_URL}}", "#mirror")
        .replace("{{HEADLINE}}", subject)
        .replace("{{GREETING}}", f"{first_name} 様")
        .replace("{{INSIGHT_PARAGRAPH}}", intent_summary)
        .replace(
            "{{VALUE_PROPOSITION}}",
            f"{product_interest} に関する関心に合わせて、必要な備えを整理するヒントをお届けします。",
        )
        .replace(
            "{{RECOMMENDATION_PARAGRAPH}}",
            "気になる保障内容やライフプランに合わせて、無理なく検討できるポイントをご確認ください。",
        )
        .replace("{{CTA_URL}}", "https://www.metlife.co.jp/")
        .replace("{{CTA_TEXT}}", "詳しく確認する")
        .replace(
            "{{DISCLAIMER}}",
            "このメールはデモ環境のプレースホルダーです。本番ではAzure OpenAIが内容を生成します。",
        )
        .replace("{{UNSUBSCRIBE_URL}}", "#unsubscribe")
    )
