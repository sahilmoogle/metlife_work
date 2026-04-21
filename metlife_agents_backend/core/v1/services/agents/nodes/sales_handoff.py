"""
Sales Handoff Agent (A9) — generates an enriched advisor briefing
and prepares the lead for CRM escalation.

Uses GPT-4 to synthesise the engagement timeline into an
actionable sales briefing with talking points and cultural notes.
"""

from __future__ import annotations

import json
import logging
import time

from langchain_core.messages import SystemMessage, HumanMessage
from prompts.briefing import A9_BRIEFING_SYSTEM, A9_BRIEFING_USER
from core.v1.services.agents.rules.scenario_rules import SCENARIO_DEFAULTS
from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry

logger = logging.getLogger(__name__)

NODE_ID = "A9_Handoff"


async def sales_handoff(state: dict, *, llm=None) -> dict:
    """Generate the advisor briefing and prepare for CRM escalation."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    scenario = state.get("scenario", "S1")
    config = SCENARIO_DEFAULTS.get(scenario, SCENARIO_DEFAULTS["S1"])

    if llm is not None:
        system_msg = A9_BRIEFING_SYSTEM.format(
            target_language=state.get("target_language", "JA"),
        )
        user_msg = A9_BRIEFING_USER.format(
            first_name=state.get("first_name", ""),
            last_name=state.get("last_name", ""),
            age=state.get("age", "unknown"),
            gender=state.get("gender", "unknown"),
            scenario=scenario,
            scenario_name=config.get("name", "General"),
            persona_code=state.get("persona_code", "unknown"),
            engagement_score=state.get("engagement_score", 0),
            email_number=state.get("email_number", 0),
            intent_summary=state.get("intent_summary", ""),
            memo=state.get("memo") or "N/A",
            context_block=state.get("context_block", ""),
        )

        try:
            response = await llm.ainvoke(
                [
                    SystemMessage(content=system_msg),
                    HumanMessage(content=user_msg),
                ]
            )
            parsed = json.loads(response.content)
            state["handoff_briefing"] = parsed.get("briefing_summary", "")
        except Exception as exc:
            logger.warning("A9 LLM briefing failed: %s", exc)
            state["handoff_briefing"] = (
                f"Briefing for {state.get('first_name', 'Customer')} "
                f"({scenario}). Score: {state.get('engagement_score', 0)}. "
                f"Intent: {state.get('intent_summary', 'N/A')}."
            )
    else:
        # ── Fallback briefing ────────────────────────────────────────
        state["handoff_briefing"] = (
            f"Sales briefing for {state.get('first_name', 'Customer')} "
            f"{state.get('last_name', '')}. "
            f"Scenario: {scenario} ({config.get('name', '')}). "
            f"Score: {state.get('engagement_score', 0):.2f}. "
            f"Emails sent: {state.get('email_number', 0)}. "
            f"Intent: {state.get('intent_summary', 'N/A')}."
        )

    # ── Mark for G4 HITL review ──────────────────────────────────────
    state["hitl_gate"] = "G4"
    state["hitl_status"] = "pending"
    state["current_node"] = NODE_ID

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("A9 handoff briefing for lead %s in %dms", lead_id, latency_ms)
    await event_manager.publish(
        node_transition_event(lead_id, NODE_ID, "completed", f"{latency_ms}ms")
    )

    state["execution_log"] = [
        create_log_entry(
            title="A9 - SALES HANDOFF · COMPLETED — Awaiting G4 Review",
            description=(
                f"Score: {state.get('engagement_score', 0):.2f} — "
                f"Briefing ready for advisor. "
                f"Emails sent: {state.get('email_number', 0)}. "
                f"Intent: {state.get('intent_summary', 'N/A')[:60]}"
            ),
            badges=[
                "G4 · Pending Review",
                "LLM Briefing" if llm else "Fallback Briefing",
            ],
        )
    ]
    return state
