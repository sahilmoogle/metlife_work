"""
HITL Gate logic — the 5 human-in-the-loop interrupt handlers.

Each gate function prepares state for the interrupt and persists
the review payload to the ``hitl_queue`` database table.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.hitl import HITLQueue
from core.v1.services.sse.manager import event_manager, hitl_required_event

logger = logging.getLogger(__name__)


async def persist_hitl_record(
    state: dict,
    gate_type: str,
    description: str,
    *,
    db: AsyncSession | None = None,
) -> None:
    """Write the HITL payload to the database for human review."""
    if db is None:
        return

    raw_bid = state.get("batch_id")
    batch_uuid = None
    if raw_bid:
        try:
            batch_uuid = uuid.UUID(str(raw_bid))
        except (ValueError, TypeError, AttributeError):
            batch_uuid = None

    record = HITLQueue(
        id=uuid.uuid4(),
        lead_id=state["lead_id"],
        batch_id=batch_uuid,
        thread_id=state.get("thread_id", ""),
        gate_type=gate_type,
        gate_description=description,
        # G1 — Content Compliance
        draft_subject=state.get("draft_email_subject"),
        draft_body=state.get("draft_email_body"),
        content_type=state.get("content_type"),
        email_number=str(state.get("email_number", 0)),
        # G4 — Sales Handoff
        handoff_briefing=state.get("handoff_briefing"),
        handoff_score_snapshot=state.get("engagement_score"),
        # G2 — Persona Override
        suggested_persona=state.get("persona_code"),
        persona_confidence=state.get("persona_confidence"),
        # G3 — Campaign Approval
        campaign_batch_size=state.get("revival_segment"),
        # Review
        review_status="Awaiting",
        reviewer_notes=state.get("hitl_reviewer_notes"),
    )
    db.add(record)
    await db.commit()
    logger.info("HITL %s record persisted for lead %s", gate_type, state["lead_id"])

    # Broadcast event via SSE so the UI knows instantly
    await event_manager.publish(
        hitl_required_event(
            lead_id=state["lead_id"],
            thread_id=state.get("thread_id", ""),
            gate=gate_type,
            detail=description,
        )
    )


# ── Gate checkers (called by graph conditional edges) ────────────────


def should_fire_g1(state: dict) -> bool:
    """G1 Content Compliance — fires before every email send."""
    return True  # All emails must pass through G1


def should_fire_g2(state: dict) -> bool:
    """G2 Persona Override — fires when classifier confidence < 0.60."""
    return state.get("persona_confidence", 1.0) < 0.60


def should_fire_g3(state: dict) -> bool:
    """G3 Campaign Approval — mandatory for S4 Dormant Revival only."""
    return state.get("scenario") == "S4"


def should_fire_g4(state: dict) -> bool:
    """G4 Sales Handoff Review — fires before CRM escalation."""
    return True  # Always requires human approval before handoff


def should_fire_g5(state: dict) -> bool:
    """G5 Score Threshold Override — fires in the edge band.

    Score is close to threshold but not yet crossed.
    Human can promote to handoff or hold for nurture.
    """
    score = state.get("engagement_score", 0)
    threshold = state.get("handoff_threshold", 0.80)
    edge_band = 0.10
    return (threshold - edge_band) <= score < threshold
