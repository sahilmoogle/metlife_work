"""
A1 — Identity & Signal Unifier.

Reads lead data from the database and assembles a unified context
block for downstream agents.  Pure Python — no LLM.
"""

from __future__ import annotations

import logging
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.leads import Lead
from model.database.v1.quotes import Quote
from model.database.v1.consultation import ConsultationRequest
from core.v1.services.sse.manager import event_manager, node_transition_event

logger = logging.getLogger(__name__)

NODE_ID = "A1_Identity"


async def identity_unifier(state: dict, *, db: AsyncSession) -> dict:
    """Assemble a unified lead profile from DB tables into state."""
    lead_id = state["lead_id"]
    await event_manager.publish(node_transition_event(lead_id, NODE_ID, "started"))
    start = time.perf_counter()

    # ── Fetch lead record ────────────────────────────────────────────
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()

    if lead is None:
        await event_manager.publish(
            node_transition_event(lead_id, NODE_ID, "failed", "Lead not found")
        )
        return {**state, "workflow_status": "failed", "current_node": NODE_ID}

    # ── Populate demographics ────────────────────────────────────────
    state["first_name"] = lead.first_name
    state["last_name"] = lead.last_name
    state["email"] = lead.email
    state["phone"] = lead.phone
    state["age"] = lead.age
    state["gender"] = lead.gender
    state["device_type"] = lead.device_type
    state["banner_code"] = lead.banner_code
    state["product_code"] = lead.product_code
    state["registration_source"] = lead.registration_source
    state["ans3"] = lead.ans3
    state["ans4"] = lead.ans4
    state["ans5"] = lead.ans5
    state["opt_in"] = bool(lead.opt_in)
    state["email_captured"] = bool(lead.email)

    # ── Fetch quote data ─────────────────────────────────────────────
    quote_result = await db.execute(select(Quote).where(Quote.lead_id == lead_id))
    quote = quote_result.scalar_one_or_none()

    # ── Check for consultation request (S6/S7) ───────────────────────
    consult_result = await db.execute(
        select(ConsultationRequest).where(ConsultationRequest.lead_id == lead_id)
    )
    consult = consult_result.scalar_one_or_none()
    if consult:
        state["memo"] = consult.memo
        state["email_captured"] = bool(consult.email)
        if not state["registration_source"]:
            state["registration_source"] = consult.request_type

    # ── Build context block ──────────────────────────────────────────
    parts = [
        f"Name: {lead.first_name or ''} {lead.last_name or ''}".strip(),
        f"Age: {lead.age}" if lead.age else None,
        f"Gender: {lead.gender}" if lead.gender else None,
        f"Device: {lead.device_type}" if lead.device_type else None,
        f"Campaign: {lead.banner_code}" if lead.banner_code else None,
        f"Product: {lead.product_code}" if lead.product_code else None,
        f"Source: {lead.registration_source}" if lead.registration_source else None,
        f"Survey: ANS3={lead.ans3}, ANS4={lead.ans4}, ANS5={lead.ans5}",
    ]
    if quote:
        parts.append(f"Quote: {quote.product_category} ¥{quote.premium_estimate_jpy}")
    if consult and consult.memo:
        parts.append(f"MEMO: {consult.memo[:500]}")

    state["context_block"] = " | ".join(p for p in parts if p)
    state["current_node"] = NODE_ID

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("A1 completed for lead %s in %dms", lead_id, latency_ms)
    await event_manager.publish(
        node_transition_event(lead_id, NODE_ID, "completed", f"{latency_ms}ms")
    )

    return state
