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
from model.database.v1.emails import EmailEvent
from core.v1.services.sse.manager import event_manager, node_transition_event
from core.v1.services.agents.state import create_log_entry
from utils.v1.db_sync import sync_lead_state

logger = logging.getLogger(__name__)

NODE_ID = "A1_Identity"


async def identity_unifier(state: dict, *, db: AsyncSession) -> dict:
    """Assemble a unified lead profile from DB tables into state."""
    lead_id = state["lead_id"]
    await event_manager.publish(
        node_transition_event(
            lead_id, NODE_ID, "started", batch_id=state.get("batch_id")
        )
    )
    start = time.perf_counter()

    # ── Fetch lead record ────────────────────────────────────────────
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()

    if lead is None:
        await event_manager.publish(
            node_transition_event(
                lead_id,
                NODE_ID,
                "failed",
                "Lead not found",
                batch_id=state.get("batch_id"),
            )
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
    state["plan_code"] = lead.plan_code
    state["accept_mail_error"] = lead.accept_mail_error
    state["session_id"] = lead.session_id
    state["ans3"] = lead.ans3
    state["ans4"] = lead.ans4
    state["ans5"] = lead.ans5
    state["opt_in"] = bool(lead.opt_in)
    state["email_captured"] = bool(lead.email)

    # Seed the workflow state with the lead's accumulated engagement score
    # from the DB so the propensity scorer starts from the real baseline
    # (not 0.0).  Without this, purely email-sent events (+0.05 each) can
    # never reach the 0.80 handoff threshold across a 5-email sequence.
    if lead.engagement_score and lead.engagement_score > state.get(
        "engagement_score", 0.0
    ):
        state["engagement_score"] = float(lead.engagement_score)

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
        state["consult_request_id"] = consult.request_id
        state["prefecture"] = consult.prefecture
        state["zip_code"] = consult.zip_code
        state["consult_campaign_code"] = consult.campaign_code
        state["contract_status"] = consult.contract_status
    else:
        state["memo"] = None
        state["consult_request_id"] = None
        state["prefecture"] = None
        state["zip_code"] = None
        state["consult_campaign_code"] = None
        state["contract_status"] = None

    # Latest non-null analytics / email campaign id for this lead (e.g. Adobe seed)
    camp_result = await db.execute(
        select(EmailEvent.campaign_id)
        .where(EmailEvent.lead_id == lead_id)
        .where(EmailEvent.campaign_id.isnot(None))
        .order_by(EmailEvent.created_at.desc())
        .limit(1)
    )
    state["latest_event_campaign_id"] = camp_result.scalar_one_or_none()

    # ── Build context block ──────────────────────────────────────────
    parts = [
        f"Name: {lead.first_name or ''} {lead.last_name or ''}".strip(),
        f"Age: {lead.age}" if lead.age else None,
        f"Gender: {lead.gender}" if lead.gender else None,
        f"Device: {lead.device_type}" if lead.device_type else None,
        f"Campaign: {lead.banner_code}" if lead.banner_code else None,
        f"Product: {lead.product_code}" if lead.product_code else None,
        f"Plan: {lead.plan_code}" if lead.plan_code else None,
        f"Source: {lead.registration_source}" if lead.registration_source else None,
        f"Survey: ANS3={lead.ans3}, ANS4={lead.ans4}, ANS5={lead.ans5}",
    ]
    if lead.accept_mail_error:
        parts.append(f"Mail delivery flag: {lead.accept_mail_error}")
    if lead.session_id:
        parts.append(f"Upstream session: {lead.session_id}")
    if quote:
        cat = quote.product_category or quote.product_code or "—"
        prem = quote.premium_estimate_jpy
        if prem is not None:
            parts.append(f"Quote: {cat} ¥{prem}")
        else:
            parts.append(f"Quote: {cat}")
    if consult:
        if consult.memo:
            parts.append(f"MEMO: {consult.memo[:500]}")
        if consult.request_id:
            parts.append(f"Request ID: {consult.request_id}")
        if consult.prefecture or consult.zip_code:
            loc = " ".join(x for x in (consult.prefecture, consult.zip_code) if x)
            parts.append(f"Location: {loc}")
        if consult.campaign_code:
            parts.append(f"Form campaign: {consult.campaign_code}")
        if consult.contract_status:
            parts.append(f"Contract status: {consult.contract_status}")
    if state.get("latest_event_campaign_id"):
        parts.append(f"Latest engagement campaign: {state['latest_event_campaign_id']}")

    state["context_block"] = " | ".join(p for p in parts if p)
    state["current_node"] = NODE_ID

    # Write back thread linkage and status so the leads table stays current
    if db is not None:
        await sync_lead_state(
            db,
            lead_id,
            thread_id=state.get("thread_id"),
            workflow_status="Active",
            current_agent_node=NODE_ID,
        )

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("A1 completed for lead %s in %dms", lead_id, latency_ms)
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"{latency_ms}ms",
            batch_id=state.get("batch_id"),
        )
    )
    state["execution_log"] = [
        create_log_entry(
            title="⚡ TRIGGER · COMPLETED: Form Submitted",
            description="T_QUOTE record → FastAPI webhook → lead_created → Workflow init",
            badges=["Webhook → FastAPI", "T_QUOTE"],
        ),
        create_log_entry(
            title="A1 - IDENTITY & SIGNAL UNIFIER · COMPLETED",
            description=f"Reads data. Assembled profile for: {state.get('first_name', '')} {state.get('last_name', '')}",
            badges=["Rule-Based", "Read: DB"],
        ),
    ]

    return state
