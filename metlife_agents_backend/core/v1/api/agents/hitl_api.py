"""
HITL Queue API — manage human-in-the-loop review items.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1 import APIResponse
from model.api.v1.agents import HITLApproveRequest, HITLQueueItem
from model.database.v1.hitl import HITLQueue
from model.database.v1.leads import Lead
from core.v1.services.agents.graph import resume_workflow
from core.v1.services.sse.manager import event_manager, hitl_resolved_event
from utils.v1.connections import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/queue",
    response_model=APIResponse[list[HITLQueueItem]],
    status_code=status.HTTP_200_OK,
)
async def get_hitl_queue(
    gate_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Fetch all pending HITL review items.

    Optional ``gate_type`` filter: G1, G2, G3, G4, G5.
    """
    query = (
        select(HITLQueue, Lead)
        .join(Lead, HITLQueue.lead_id == Lead.id)
        .where(HITLQueue.review_status == "Awaiting")
    )
    if gate_type:
        query = query.where(HITLQueue.gate_type == gate_type)
    query = query.order_by(HITLQueue.created_at.desc())

    result = await db.execute(query)
    records = result.all()

    items = [
        HITLQueueItem(
            id=str(r.HITLQueue.id),
            lead_id=str(r.HITLQueue.lead_id),
            first_name=r.Lead.first_name,
            last_name=r.Lead.last_name,
            scenario_id=r.Lead.scenario_id,
            engagement_score=r.Lead.engagement_score,
            thread_id=r.HITLQueue.thread_id,
            gate_type=r.HITLQueue.gate_type,
            gate_description=r.HITLQueue.gate_description,
            draft_subject=r.HITLQueue.draft_subject,
            draft_body=r.HITLQueue.draft_body,
            handoff_briefing=r.HITLQueue.handoff_briefing,
            suggested_persona=r.HITLQueue.suggested_persona,
            persona_confidence=r.HITLQueue.persona_confidence,
            review_status=r.HITLQueue.review_status,
            reviewer_notes=r.HITLQueue.reviewer_notes,
            created_at=str(r.HITLQueue.created_at) if r.HITLQueue.created_at else None,
        )
        for r in records
    ]

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=items,
        message=f"{len(items)} pending review items",
    )


@router.post(
    "/{thread_id}/approve",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def approve_hitl(
    thread_id: str,
    request: HITLApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Approve, edit, or reject a HITL review item.

    After updating the database record, resumes the LangGraph
    workflow from the checkpoint.
    """
    # ── Update the HITL record ───────────────────────────────────────
    update_values = {
        "review_status": request.action.capitalize(),
        "reviewed_at": datetime.now(timezone.utc),
        "reviewer_notes": request.reviewer_notes,
    }
    if request.edited_subject:
        update_values["edited_subject"] = request.edited_subject
    if request.edited_body:
        update_values["edited_body"] = request.edited_body

    stmt = (
        update(HITLQueue)
        .where(HITLQueue.thread_id == thread_id)
        .where(HITLQueue.review_status == "Awaiting")
        .values(**update_values)
    )
    result = await db.execute(stmt)
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No pending HITL record for thread {thread_id}",
        )

    # ── Broadcast SSE event ──────────────────────────────────────────
    resolution = "edited" if request.action == "edited" else "approved"
    await event_manager.publish(
        hitl_resolved_event(
            lead_id="",
            thread_id=thread_id,
            gate="",
            resolution=resolution,
        )
    )

    # ── Resume the LangGraph workflow ────────────────────────────────
    if request.action != "rejected":
        try:
            await resume_workflow(
                thread_id=thread_id,
                db_session=db,
                resume_value=request.action,
            )
            return APIResponse(
                success=True,
                status_code=status.HTTP_200_OK,
                data={"thread_id": thread_id, "resumed": True},
                message=f"HITL {request.action}. Workflow resumed.",
            )
        except Exception as e:
            logger.error("Resume after HITL failed: %s", e, exc_info=True)
            return APIResponse(
                success=True,
                status_code=status.HTTP_200_OK,
                data={"thread_id": thread_id, "resumed": False, "error": str(e)},
                message=f"HITL {request.action}. Resume failed — manual retry needed.",
            )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data={"thread_id": thread_id, "resumed": False},
        message="HITL rejected. Workflow not resumed.",
    )
