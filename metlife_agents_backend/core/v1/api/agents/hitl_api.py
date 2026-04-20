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
    query = select(HITLQueue).where(HITLQueue.review_status == "Awaiting")
    if gate_type:
        query = query.where(HITLQueue.gate_type == gate_type)
    query = query.order_by(HITLQueue.created_at.desc())

    result = await db.execute(query)
    records = result.scalars().all()

    items = [
        HITLQueueItem(
            id=str(r.id),
            lead_id=str(r.lead_id),
            thread_id=r.thread_id,
            gate_type=r.gate_type,
            gate_description=r.gate_description,
            draft_subject=r.draft_subject,
            draft_body=r.draft_body,
            handoff_briefing=r.handoff_briefing,
            suggested_persona=r.suggested_persona,
            persona_confidence=r.persona_confidence,
            review_status=r.review_status,
            created_at=str(r.created_at) if r.created_at else None,
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
