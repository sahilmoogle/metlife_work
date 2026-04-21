"""
A3 — Intent Analyser.

Uses GPT-4 mini to extract urgency, product interest, and pain points
from the lead's engagement signals and MEMO field.
"""

from __future__ import annotations

import json
import logging
import time

from prompts.intent import A3_INTENT_SYSTEM, A3_INTENT_USER
from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

NODE_ID = "A3_Intent"


async def intent_analyser(state: dict, *, llm=None) -> dict:
    """Analyse lead intent from engagement signals.

    Args:
        state: Current graph state.
        llm: LangChain-compatible chat model (injected at graph build).
    """
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    # ── Build the prompt ─────────────────────────────────────────────
    user_msg = A3_INTENT_USER.format(
        scenario=state.get("scenario", "unknown"),
        persona_code=state.get("persona_code", "unknown"),
        age=state.get("age", "unknown"),
        gender=state.get("gender", "unknown"),
        engagement_score=state.get("engagement_score", 0),
        email_number=state.get("email_number", 0),
        context_block=state.get("context_block", "No context available"),
        memo=state.get("memo") or "N/A",
    )

    if llm is not None:
        try:
            response = await llm.ainvoke(
                [
                    SystemMessage(content=A3_INTENT_SYSTEM),
                    HumanMessage(content=user_msg),
                ]
            )
            parsed = json.loads(response.content)
            state["intent_summary"] = parsed.get("intent_summary", "")
            state["urgency"] = parsed.get("urgency", "medium")
            state["product_interest"] = parsed.get("product_interest", "general")
        except Exception as exc:
            logger.warning("A3 LLM call failed, using defaults: %s", exc)
            state["intent_summary"] = "Intent analysis unavailable — LLM error."
            state["urgency"] = "medium"
            state["product_interest"] = "general"
    else:
        # ── Fallback: rule-based defaults ────────────────────────────
        state["intent_summary"] = (
            f"Lead {state.get('first_name', '')} in scenario "
            f"{state.get('scenario', 'unknown')}. "
            f"Score: {state.get('engagement_score', 0)}."
        )
        state["urgency"] = "medium"
        state["product_interest"] = state.get("product_code") or "general"

    state["current_node"] = NODE_ID

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("A3 completed for lead %s in %dms", lead_id, latency_ms)
    await event_manager.publish(
        node_transition_event(lead_id, NODE_ID, "completed", f"{latency_ms}ms")
    )

    state["execution_log"] = [
        create_log_entry(
            title="A3 - INTENT & SENTIMENT ANALYSER · COMPLETED",
            description=f"Summary: {state.get('intent_summary', '')[:50]}... Urgency: {state.get('urgency', 'medium')}. Interest: {state.get('product_interest', 'general')}",
            badges=["LLM Extractor", "Azure OpenAI"],
        )
    ]
    return state
