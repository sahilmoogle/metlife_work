"""
HITL Queue API — manage human-in-the-loop review items.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1 import APIResponse
from model.api.v1.agents import HITLApproveRequest, HITLQueueItem
from model.database.v1.hitl import HITLQueue
from model.database.v1.leads import Lead
from core.v1.services.agents.graph import (
    resume_workflow,
    build_graph,
    get_checkpointer,
)
from core.v1.services.sse.manager import (
    event_manager,
    hitl_resolved_event,
    lead_converted_event,
)
from utils.v1.connections import get_db
from utils.v1.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter()


def _g1_checkpoint_patch(request: HITLApproveRequest) -> dict | None:
    """Map reviewer edits onto LangGraph state keys before G1 resume.

    ``hitl_queue`` stores reviewer edits as ``edited_*``; the graph uses
    ``draft_email_*`` through send_engine — we merge here so DB + checkpoint match.
    """
    patch: dict = {}
    if request.edited_subject is not None:
        patch["draft_email_subject"] = request.edited_subject
    if request.edited_body is not None:
        patch["draft_email_body"] = request.edited_body
    return patch if patch else None


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
            edited_subject=r.HITLQueue.edited_subject,
            edited_body=r.HITLQueue.edited_body,
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


@router.get(
    "/{thread_id}",
    response_model=APIResponse[HITLQueueItem],
    status_code=status.HTTP_200_OK,
)
async def get_hitl_detail(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the full detail for a single HITL review item.

    Used by the HITL detail screen to display the email draft,
    persona suggestion, score snapshot, and handoff briefing.
    """
    query = (
        select(HITLQueue, Lead)
        .join(Lead, HITLQueue.lead_id == Lead.id)
        .where(HITLQueue.thread_id == thread_id)
        .order_by(HITLQueue.created_at.desc())
    )
    result = await db.execute(query)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No HITL record found for thread {thread_id}",
        )

    item = HITLQueueItem(
        id=str(row.HITLQueue.id),
        lead_id=str(row.HITLQueue.lead_id),
        first_name=row.Lead.first_name,
        last_name=row.Lead.last_name,
        scenario_id=row.Lead.scenario_id,
        engagement_score=row.Lead.engagement_score,
        thread_id=row.HITLQueue.thread_id,
        gate_type=row.HITLQueue.gate_type,
        gate_description=row.HITLQueue.gate_description,
        draft_subject=row.HITLQueue.draft_subject,
        draft_body=row.HITLQueue.draft_body,
        edited_subject=row.HITLQueue.edited_subject,
        edited_body=row.HITLQueue.edited_body,
        handoff_briefing=row.HITLQueue.handoff_briefing,
        suggested_persona=row.HITLQueue.suggested_persona,
        persona_confidence=row.HITLQueue.persona_confidence,
        review_status=row.HITLQueue.review_status,
        reviewer_notes=row.HITLQueue.reviewer_notes,
        created_at=str(row.HITLQueue.created_at) if row.HITLQueue.created_at else None,
    )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=item,
        message="HITL detail retrieved.",
    )


@router.post(
    "/{thread_id}/approve",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def approve_hitl(
    thread_id: str,
    request: HITLApproveRequest,
    current_user: dict = Depends(require_permission("hitl_approve")),
    db: AsyncSession = Depends(get_db),
):
    """Approve, edit, hold, or reject a HITL review item.

    After updating the database record, optionally resumes the LangGraph
    workflow from the checkpoint.  The HITL decision (action) is injected
    into state so conditional edges (G1 reject, G5 hold) route correctly.
    """
    # ── Fetch the HITL record so we know lead_id and gate_type ──────
    hitl_result = await db.execute(
        select(HITLQueue)
        .where(HITLQueue.thread_id == thread_id)
        .where(HITLQueue.review_status == "Awaiting")
    )
    hitl_record = hitl_result.scalars().first()

    if not hitl_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No pending HITL record for thread {thread_id}",
        )

    lead_id = str(hitl_record.lead_id)
    gate_type = hitl_record.gate_type

    # ── Update the HITL record ───────────────────────────────────────
    update_values: dict = {
        "review_status": request.action.capitalize(),
        "reviewed_at": datetime.now(timezone.utc),
        "reviewer_notes": request.reviewer_notes,
        "reviewed_by_user_id": current_user.get("user_id"),
    }
    if request.edited_subject is not None:
        update_values["edited_subject"] = request.edited_subject
    if request.edited_body is not None:
        update_values["edited_body"] = request.edited_body

    stmt = (
        sa_update(HITLQueue)
        .where(HITLQueue.thread_id == thread_id)
        .where(HITLQueue.review_status == "Awaiting")
        .values(**update_values)
    )
    await db.execute(stmt)
    await db.commit()

    # ── Determine new Lead workflow_status based on gate + action ────
    #
    #  G4 approved  → "Converted"  (handoff accepted by sales, journey complete)
    #  G4 rejected  → "Active"     (sales said not ready; lead stays in nurture)
    #  G3 rejected  → "Dormant"    (campaign manager said no; back to cooldown)
    #  G3 approved  → "Active"     (S4 revival campaign proceeding)
    #  G1 rejected  → "Active"     (content rejected; re-draft in progress)
    #  G2 / G5 any  → "Active"
    if gate_type == "G4" and request.action in ("approved", "edited"):
        lead_status = "Converted"
    elif gate_type == "G3" and request.action == "rejected":
        lead_status = "Dormant"
    else:
        lead_status = "Active"

    lead_update_values: dict = {"workflow_status": lead_status}
    if gate_type == "G4" and request.action in ("approved", "edited"):
        lead_update_values["is_converted"] = True

    await db.execute(
        sa_update(Lead).where(Lead.thread_id == thread_id).values(**lead_update_values)
    )
    await db.commit()

    # ── Broadcast SSE event with real lead_id + gate ─────────────────
    resolution = "edited" if request.action == "edited" else request.action
    await event_manager.publish(
        hitl_resolved_event(
            lead_id=lead_id,
            thread_id=thread_id,
            gate=gate_type,
            resolution=resolution,
        )
    )

    # ── Extra SSE event for G4 approval → drives Live Activity Feed ──
    if gate_type == "G4" and request.action in ("approved", "edited"):
        lead_result = await db.execute(select(Lead).where(Lead.thread_id == thread_id))
        converted_lead = lead_result.scalars().first()
        if converted_lead:
            await event_manager.publish(
                lead_converted_event(
                    lead_id=lead_id,
                    thread_id=thread_id,
                    score=converted_lead.engagement_score or 0.0,
                    scenario_id=converted_lead.scenario_id or "",
                )
            )

    # ── Apply G2 persona override before resuming ────────────────────
    if gate_type == "G2" and request.persona_override:
        try:
            async with get_checkpointer() as cp:
                graph = build_graph(checkpointer=cp)
                config = {"configurable": {"thread_id": thread_id}}
                await graph.aupdate_state(
                    config,
                    {
                        "persona_code": request.persona_override,
                        "persona_confidence": 0.95,
                    },
                )
            # Also persist to Lead row
            await db.execute(
                sa_update(Lead)
                .where(Lead.thread_id == thread_id)
                .values(
                    persona_code=request.persona_override,
                    persona_confidence=0.95,
                )
            )
            await db.commit()
        except Exception as e:
            logger.warning("G2 persona override update failed: %s", e)

    # ── Resume the LangGraph workflow ────────────────────────────────
    # Rejected G1 → resume with "rejected" so the graph re-routes to generative_writer
    # Hold G5 → resume with "hold" so the graph routes back to nurture
    should_resume = request.action != "rejected" or gate_type == "G1"
    # For all gates, resume even on rejection so G1 can re-route; other rejections dead-end
    # G4 rejection: don't resume (handoff not proceeding)
    if gate_type == "G4" and request.action == "rejected":
        should_resume = False
    # G3 rejection: don't resume (campaign manager said no)
    if gate_type == "G3" and request.action == "rejected":
        should_resume = False

    if should_resume:
        try:
            g1_patch = (
                _g1_checkpoint_patch(request)
                if gate_type == "G1" and request.action != "rejected"
                else None
            )
            result = await resume_workflow(
                thread_id=thread_id,
                db_session=db,
                resume_value=request.action,
                state_patch=g1_patch,
            )
            state = result.get("state", {})
            next_gate = state.get("hitl_gate")
            msg = (
                f"HITL {request.action}. Workflow running — next gate: {next_gate}."
                if next_gate
                else f"HITL {request.action}. Workflow completed."
            )
            return APIResponse(
                success=True,
                status_code=status.HTTP_200_OK,
                data={
                    "thread_id": thread_id,
                    "resumed": True,
                    "gate": gate_type,
                    "next_gate": next_gate,
                    "current_node": state.get("current_node"),
                },
                message=msg,
            )
        except Exception as e:
            logger.error(
                "Resume after HITL failed for thread %s: %s",
                thread_id,
                e,
                exc_info=True,
            )
            # Raise a real 500 so the caller knows the workflow is stuck.
            # The HITL record is already marked Approved in the DB — to unstick,
            # call POST /api/v1/agents/{thread_id}/resume
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    f"HITL decision saved but workflow resume failed: {str(e)}. "
                    f"To unstick: POST /api/v1/agents/{thread_id}/resume"
                ),
            )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data={"thread_id": thread_id, "resumed": False, "gate": gate_type},
        message=f"HITL {request.action}. Workflow not resumed.",
    )
