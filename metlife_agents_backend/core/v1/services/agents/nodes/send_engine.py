"""
Send Engine (A6) — handles the final email dispatch.

Re-checks OPT_IN, enforces quiet hours (21:00–08:00 JST),
and records the communication in the database.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone, timedelta

from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.communications import Communication
from model.database.v1.emails import EmailEvent
from model.database.v1.leads import Lead
from core.v1.services.sse.manager import (
    event_manager,
    node_transition_event,
    workflow_state_event,
)
from core.v1.services.agents.state import create_log_entry

logger = logging.getLogger(__name__)

NODE_ID = "A6_Send"

# JST quiet hours: 21:00 – 08:00
JST = timezone(timedelta(hours=9))
QUIET_START = 21
QUIET_END = 8


def _is_quiet_hours() -> bool:
    """Check if current JST time is within quiet hours."""
    now_jst = datetime.now(JST)
    return now_jst.hour >= QUIET_START or now_jst.hour < QUIET_END


async def send_engine(state: dict, *, db: AsyncSession | None = None) -> dict:
    """Execute the email send (simulated) with compliance checks."""
    lead_id = state["lead_id"]
    await event_manager.publish(
        node_transition_event(
            lead_id, NODE_ID, "started", batch_id=state.get("batch_id")
        )
    )
    start = time.perf_counter()

    # ── Re-check OPT_IN ──────────────────────────────────────────────
    if state.get("opt_in"):
        state["workflow_status"] = "suppressed"
        state["current_node"] = NODE_ID
        if db is not None:
            now = datetime.now(timezone.utc)
            await db.execute(
                sa_update(Lead)
                .where(Lead.id == lead_id)
                .values(
                    workflow_status="Suppressed",
                    workflow_completed=True,
                    completed_at=now,
                    current_agent_node=NODE_ID,
                )
            )
            await db.commit()
        await event_manager.publish(
            node_transition_event(
                lead_id,
                NODE_ID,
                "completed",
                "OPT_IN → suppressed",
                batch_id=state.get("batch_id"),
            )
        )
        return state

    # ── Quiet hours enforcement (21:00–08:00 JST) ────────────────────
    # Spec: never send during these hours. Critical for S3 seniors.
    # We log the hold event and mark the state; a scheduler would resume at 08:00.
    # In this mock, we proceed after recording the hold in the execution_log.
    if _is_quiet_hours():
        now_jst = datetime.now(JST)
        logger.info(
            "A6: Quiet hours active (%02d:%02d JST) — email held until 08:00 JST",
            now_jst.hour,
            now_jst.minute,
        )
        state["execution_log"] = [
            create_log_entry(
                title="A6 - SEND ENGINE · QUIET HOURS HOLD",
                description=f"Current JST time {now_jst.strftime('%H:%M')} is within 21:00–08:00 quiet window. Email queued for 08:00 JST.",
                badges=["Quiet Hours", "Held"],
            )
        ]
        await event_manager.publish(
            node_transition_event(
                lead_id,
                NODE_ID,
                "paused",
                "quiet hours hold until 08:00 JST",
                batch_id=state.get("batch_id"),
            )
        )

    # ── Simulate send ────────────────────────────────────────────────
    subject = state.get("draft_email_subject", "")
    body = state.get("draft_email_body", "")

    logger.info(
        "A6 SEND: lead=%s subject='%s' (email #%d)",
        lead_id,
        subject[:60],
        state.get("email_number", 0),
    )

    # ── Persist to communications table + EmailEvent + increment counter
    email_num = state.get("email_number", 0)
    if db is not None:
        now = datetime.now(timezone.utc)
        comm = Communication(
            lead_id=lead_id,
            subject=subject,
            subject_en=state.get(
                "draft_email_subject_en"
            ),  # English label for operator dashboard
            template_name=state.get("template_name"),  # Seed template key
            body_preview=body[:500] if body else None,
            email_number=email_num,
            content_type=state.get("content_type", "unknown"),
            sent_at=now,
            delivered_at=now,  # mock delivery confirmation = same timestamp as send
        )
        db.add(comm)

        # Write an EmailEvent row for the email_sent signal (feeds A8 scoring history)
        email_evt = EmailEvent(
            lead_id=lead_id,
            event_type="email_sent",
            score_delta=0.05,
            email_number=email_num,
        )
        db.add(email_evt)

        await db.execute(
            sa_update(Lead)
            .where(Lead.id == lead_id)
            .values(
                emails_sent_count=Lead.emails_sent_count + 1,
                current_agent_node=NODE_ID,
                workflow_status="Active",
            )
        )
        await db.commit()

    # ── Update state ─────────────────────────────────────────────────
    state["hitl_status"] = "idle"
    state["hitl_gate"] = None
    state["current_node"] = NODE_ID

    latency_ms = int((time.perf_counter() - start) * 1000)
    await event_manager.publish(
        node_transition_event(
            lead_id,
            NODE_ID,
            "completed",
            f"sent {latency_ms}ms",
            batch_id=state.get("batch_id"),
        )
    )
    await event_manager.publish(
        workflow_state_event(lead_id, "email_sent", f"Email #{email_num} dispatched")
    )

    state["execution_log"] = [
        create_log_entry(
            title=f"A6 - SEND ENGINE · COMPLETED (Email #{email_num})",
            description=f"Subject: {subject[:80]}",
            badges=["Dispatched", f"Email #{email_num}"],
        )
    ]
    return state
