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

from prompts.writer import A4A5_WRITER_SYSTEM, A4A5_WRITER_USER
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
        )

        user_msg = A4A5_WRITER_USER.format(
            first_name=state.get("first_name", ""),
            last_name=state.get("last_name", ""),
            age=state.get("age", "unknown"),
            scenario=scenario,
            intent_summary=state.get("intent_summary", ""),
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
            parsed = json.loads(response.content)
            state["draft_email_subject"] = parsed.get("subject", "")
            state["draft_email_body"] = parsed.get("body", "")
            state["hitl_reviewer_notes"] = json.dumps(
                parsed.get("compliance_checklist", [])
            )
        except Exception as exc:
            logger.error("A5 LLM generation failed for lead %s: %s", lead_id, exc)
            raise RuntimeError("LLM email generation failed.") from exc
    else:
        raise RuntimeError("LLM client not configured for generated email path.")

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

    content_label = (
        "existing_asset" if content_type == "existing_asset" else "LLM-generated"
    )
    state["execution_log"] = [
        create_log_entry(
            title=f"A5 - GENERATIVE WRITER · COMPLETED (Email #{state.get('email_number', 1)})",
            description=(
                f"{content_label} — Subject: {str(state.get('draft_email_subject', ''))[:60]}"
            ),
            badges=["Pass-through"]
            if content_type == "existing_asset"
            else ["LLM", "Azure OpenAI"],
        )
    ]
    return state
