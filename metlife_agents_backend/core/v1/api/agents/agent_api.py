"""
Agent Workflow API — start, pause, and monitor agent workflows.
"""

import json
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
import sqlalchemy as sa
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from model.api.v1 import APIResponse
from model.api.v1.agents import (
    StartWorkflowRequest,
    StartWorkflowResponse,
    ResumeWorkflowRequest,
    EventTrackRequest,
    WorkflowHistoryResponse,
    WorkflowStateResponse,
    ExecutionLogEntry,
    BatchRunResponse,
)
from model.database.v1.leads import Lead
from model.database.v1.communications import Communication
from model.database.v1.emails import EmailEvent
from model.database.v1.batch_runs import BatchRun
from core.v1.services.agents.graph import (
    start_workflow,
    resume_workflow,
    build_graph,
    get_checkpointer,
)
from core.v1.services.sse.manager import event_manager, batch_progress_event
from utils.v1.connections import get_db
from utils.v1.permissions import require_permission
from config.v1.database_config import db_config

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/start",
    response_model=APIResponse[StartWorkflowResponse],
    status_code=status.HTTP_201_CREATED,
)
async def start_agent_workflow(
    request: StartWorkflowRequest,
    _: dict = Depends(require_permission("start_agent")),
    db: AsyncSession = Depends(get_db),
):
    """Start a new LangGraph workflow for a lead.

    Initialises the graph thread, runs through A1 → A2 until the
    first HITL interrupt (G1 before send_engine), and returns the
    thread_id for subsequent resume calls.
    """
    try:
        result = await start_workflow(
            lead_id=request.lead_id,
            db_session=db,
            target_language=request.target_language,
        )

        state = result.get("state", {})
        response_data = StartWorkflowResponse(
            thread_id=result["thread_id"],
            lead_id=result["lead_id"],
            scenario=state.get("scenario"),
            current_node=state.get("current_node"),
            engagement_score=state.get("engagement_score", 0.0),
            workflow_status=state.get("workflow_status", "active"),
            hitl_gate=state.get("hitl_gate"),
        )

        return APIResponse(
            success=True,
            status_code=status.HTTP_201_CREATED,
            data=response_data,
            message=f"Workflow started. Thread: {result['thread_id']}",
        )
    except Exception as e:
        logger.error("Workflow start failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start workflow: {str(e)}",
        )


@router.post(
    "/resume",
    response_model=APIResponse[StartWorkflowResponse],
    status_code=status.HTTP_200_OK,
)
async def resume_agent_workflow(
    request: ResumeWorkflowRequest,
    _: dict = Depends(require_permission("start_agent")),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused workflow after HITL approval.

    Loads the checkpointed state from the persistence layer and
    continues the graph execution from the last interrupt point.
    """
    try:
        result = await resume_workflow(
            thread_id=request.thread_id,
            db_session=db,
            resume_value=request.resume_value,
        )

        state = result.get("state", {})
        response_data = StartWorkflowResponse(
            thread_id=result["thread_id"],
            lead_id=state.get("lead_id", ""),
            scenario=state.get("scenario"),
            current_node=state.get("current_node"),
            engagement_score=state.get("engagement_score", 0.0),
            workflow_status=state.get("workflow_status", "active"),
            hitl_gate=state.get("hitl_gate"),
        )

        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data=response_data,
            message="Workflow resumed successfully.",
        )
    except Exception as e:
        logger.error("Workflow resume failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resume workflow: {str(e)}",
        )


@router.post(
    "/{thread_id}/resume",
    response_model=APIResponse[StartWorkflowResponse],
    status_code=status.HTTP_200_OK,
)
async def retry_resume_workflow(
    thread_id: str,
    _: dict = Depends(require_permission("start_agent")),
    db: AsyncSession = Depends(get_db),
    resume_value: str = "approved",
):
    """Retry / unstick a workflow that was approved but never resumed.

    Use this when a HITL record shows review_status='Approved' but the
    workflow is still paused (the next gate never appeared).  This happens
    when the server crashed or a bug prevented the resume after approval.

    Pass ``resume_value`` query param to override the decision
    (default: ``"approved"``).  The checkpoint state already holds
    ``hitl_resume_value`` from the original approval, so this is only
    needed if you want to change the decision.
    """
    try:
        result = await resume_workflow(
            thread_id=thread_id,
            db_session=db,
            resume_value=resume_value,
        )
        state = result.get("state", {})
        response_data = StartWorkflowResponse(
            thread_id=thread_id,
            lead_id=state.get("lead_id", ""),
            scenario=state.get("scenario"),
            current_node=state.get("current_node"),
            engagement_score=state.get("engagement_score", 0.0),
            workflow_status=state.get("workflow_status", "active"),
            hitl_gate=state.get("hitl_gate"),
        )
        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data=response_data,
            message=f"Workflow resumed from thread {thread_id}. Next gate: {state.get('hitl_gate') or 'none (completed)'}",
        )
    except Exception as e:
        logger.error(
            "Manual resume failed for thread %s: %s", thread_id, e, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resume failed: {str(e)}",
        )


@router.get(
    "/{thread_id}/status",
    response_model=APIResponse[StartWorkflowResponse],
    status_code=status.HTTP_200_OK,
)
async def get_workflow_status(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the current state of an agent workflow.

    Used by the frontend to restore state after a page refresh.
    Reads directly from the LangGraph persistence checkpoint.
    """
    try:
        config = {"configurable": {"thread_id": thread_id}}
        async with get_checkpointer() as cp:
            graph = build_graph(db_session=db, checkpointer=cp)
            state_snapshot = await graph.aget_state(config)

        if not state_snapshot or not state_snapshot.values:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active workflow found for thread {thread_id}",
            )

        state = state_snapshot.values

        response_data = StartWorkflowResponse(
            thread_id=thread_id,
            lead_id=state.get("lead_id", ""),
            scenario=state.get("scenario"),
            current_node=state.get("current_node"),
            engagement_score=state.get("engagement_score", 0.0),
            workflow_status=state.get("workflow_status", "active"),
            hitl_gate=state.get("hitl_gate"),
        )

        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data=response_data,
            message="Workflow status retrieved successfully.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get workflow status: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving workflow status: {str(e)}",
        )


@router.get(
    "/{thread_id}/history",
    response_model=APIResponse[WorkflowHistoryResponse],
    status_code=status.HTTP_200_OK,
)
async def get_workflow_history(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the execution history (audit trail) of a workflow.

    Returns the chronological sequence of node executions and agent decisions.
    """
    try:
        config = {"configurable": {"thread_id": thread_id}}
        async with get_checkpointer() as cp:
            graph = build_graph(db_session=db, checkpointer=cp)
            state_snapshot = await graph.aget_state(config)

        if not state_snapshot or not state_snapshot.values:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active workflow found for thread {thread_id}",
            )

        state = state_snapshot.values
        execution_log = state.get("execution_log", [])

        response_data = WorkflowHistoryResponse(
            thread_id=thread_id,
            execution_log=execution_log,
        )

        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data=response_data,
            message="Workflow history retrieved successfully.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch workflow history: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch workflow history: {str(e)}",
        )


@router.post(
    "/batch/run",
    response_model=APIResponse[BatchRunResponse],
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_batch_orchestrator(
    background_tasks: BackgroundTasks,
    _: dict = Depends(require_permission("run_workflow")),
    db: AsyncSession = Depends(get_db),
):
    """Batch Orchestrator — single entry point for the Work Flow Engine 'Run' button.

    Lead selection uses **facts**, not ``workflow_status`` buckets:
    - Runnable: ``opt_in`` is false (not suppressed), not converted, and either no
      LangGraph ``thread_id`` yet or ``workflow_completed`` is true (does not disturb an
      in-flight thread).
    - **Standard** start (default graph): not cold by the rules below.
    - **S4 revival** (cold / dormant-style re-entry at A10): ``cooldown_flag`` is false,
      and either ``last_active_at <= cutoff``, or ``last_active_at`` is null and
      ``commit_time <= cutoff`` (registration / Oracle COMMIT_TIME as clock when no
      engagement timestamps exist yet).

    Batch stats still expose ``total_new`` / ``total_dormant`` as counts of standard vs
    revival rows (field names unchanged for API compatibility).

    Creates a ``BatchRun`` record immediately and returns its ``batch_id``.
    Progress is tracked per-lead in the background and broadcast via SSE
    ``batch_progress`` events so the UI can show a live progress bar.

    Poll GET /agents/batch/{batch_id} or watch SSE for live updates.
    """
    dormancy_cutoff = datetime.now(timezone.utc) - timedelta(days=180)

    def _naive_utc(dt: datetime | None) -> datetime | None:
        if dt is None:
            return None
        if getattr(dt, "tzinfo", None) is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    eligible_result = await db.execute(
        select(Lead.id, Lead.last_active_at, Lead.cooldown_flag, Lead.commit_time)
        .where(
            Lead.opt_in == False,  # noqa: E712
            Lead.is_converted == False,  # noqa: E712
            sa.or_(
                Lead.thread_id.is_(None),
                Lead.workflow_completed.is_(True),
            ),
        )
        .order_by(Lead.id.asc())
    )

    standard_lead_ids: list[str] = []
    dormant_lead_ids: list[str] = []
    for lid, la, cooldown, commit_t in eligible_result.all():
        lid_str = str(lid)
        la_u = _naive_utc(la)
        commit_u = _naive_utc(commit_t)
        stale_by_activity = la_u is not None and la_u <= dormancy_cutoff
        stale_by_commit_only = (
            la_u is None and commit_u is not None and commit_u <= dormancy_cutoff
        )
        revival = cooldown is not True and (stale_by_activity or stale_by_commit_only)
        if revival:
            dormant_lead_ids.append(lid_str)
        else:
            standard_lead_ids.append(lid_str)

    new_lead_ids = standard_lead_ids
    total = len(new_lead_ids) + len(dormant_lead_ids)
    if total == 0:
        return APIResponse(
            success=False,
            status_code=status.HTTP_200_OK,
            data=BatchRunResponse(
                batch_id="",
                status="completed",
                total=0,
                total_new=0,
                total_dormant=0,
                processed_count=0,
                success_count=0,
                failed_count=0,
                pct=0,
            ),
            message="No eligible leads for batch (opt-out, converted, or in-flight thread without completion).",
        )

    batch = BatchRun(
        total_new=len(new_lead_ids),
        total_dormant=len(dormant_lead_ids),
        total=total,
        status="running",
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    batch_id = str(batch.id)

    async def process_all(
        batch_id: str,
        new_list: list[str],
        dormant_list: list[str],
    ) -> None:
        """Background task: run every lead, track progress, update BatchRun."""
        db_url = db_config.get_database_url()
        engine = create_async_engine(db_url, echo=False)
        AsyncSessionLocal = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        success_count = 0
        failed_count = 0
        failed_ids: list[str] = []
        errors: dict[str, str] = {}
        total_leads = len(new_list) + len(dormant_list)

        async with AsyncSessionLocal() as bg_db:
            all_items = [(lead_id_str, False) for lead_id_str in new_list] + [
                (lead_id_str, True) for lead_id_str in dormant_list
            ]

            for lead_id_str, is_dormant in all_items:
                try:
                    if is_dormant:
                        await start_workflow(
                            lead_id=lead_id_str,
                            db_session=bg_db,
                            scenario="S4",
                            batch_id=batch_id,
                        )
                    else:
                        await start_workflow(
                            lead_id=lead_id_str,
                            db_session=bg_db,
                            batch_id=batch_id,
                        )
                    success_count += 1
                except Exception as exc:
                    failed_count += 1
                    failed_ids.append(lead_id_str)
                    errors[lead_id_str] = str(exc)
                    logger.error(
                        "Batch lead %s failed: %s",
                        lead_id_str,
                        exc,
                        exc_info=True,
                    )

                processed = success_count + failed_count
                current_status = "running"

                # Update BatchRun progress row (use batch_id string — batch ORM
                # object belongs to the request session which is already closed)
                await bg_db.execute(
                    sa_update(BatchRun)
                    .where(BatchRun.id == batch_id)
                    .values(
                        processed_count=processed,
                        success_count=success_count,
                        failed_count=failed_count,
                        failed_lead_ids=json.dumps(failed_ids),
                        error_summary=json.dumps(errors),
                    )
                )
                await bg_db.commit()

                # SSE progress broadcast
                await event_manager.publish(
                    batch_progress_event(
                        batch_id=batch_id,
                        processed=processed,
                        total=total_leads,
                        success=success_count,
                        failed=failed_count,
                        status=current_status,
                    )
                )

            # ── Mark final status ────────────────────────────────────
            if failed_count == 0:
                final_status = "completed"
            elif success_count == 0:
                final_status = "failed"
            else:
                final_status = "partial_failure"

            await bg_db.execute(
                sa_update(BatchRun)
                .where(BatchRun.id == batch_id)
                .values(
                    status=final_status,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await bg_db.commit()

            # Final SSE event
            await event_manager.publish(
                batch_progress_event(
                    batch_id=batch_id,
                    processed=total_leads,
                    total=total_leads,
                    success=success_count,
                    failed=failed_count,
                    status=final_status,
                )
            )

            logger.info(
                "Batch %s finished — total=%d success=%d failed=%d status=%s",
                batch_id,
                total_leads,
                success_count,
                failed_count,
                final_status,
            )

        await engine.dispose()

    background_tasks.add_task(process_all, batch_id, new_lead_ids, dormant_lead_ids)

    return APIResponse(
        success=True,
        status_code=status.HTTP_202_ACCEPTED,
        data=BatchRunResponse(
            batch_id=batch_id,
            status="running",
            total=total,
            total_new=len(new_lead_ids),
            total_dormant=len(dormant_lead_ids),
            processed_count=0,
            success_count=0,
            failed_count=0,
            pct=0,
        ),
        message=(
            f"Batch started (id={batch_id}): "
            f"{len(new_lead_ids)} standard path(s), {len(dormant_lead_ids)} S4 revival(s). "
            f"Watch SSE batch_progress events or poll GET /agents/batch/{batch_id}."
        ),
    )


@router.get(
    "/batch/latest",
    response_model=APIResponse[BatchRunResponse],
    status_code=status.HTTP_200_OK,
)
async def get_latest_batch(db: AsyncSession = Depends(get_db)):
    """Return the most recent batch run.

    Used by the UI on page load / browser refresh to show the last
    known batch status without needing to store the batch_id client-side.
    """
    result = await db.execute(
        select(BatchRun).order_by(BatchRun.started_at.desc()).limit(1)
    )
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No batch runs found.",
        )
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=_batch_to_response(batch),
        message="Latest batch run retrieved.",
    )


@router.get(
    "/batch/{batch_id}",
    response_model=APIResponse[BatchRunResponse],
    status_code=status.HTTP_200_OK,
)
async def get_batch_status(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return status + progress for a specific batch run.

    Poll this endpoint to show a progress bar when SSE is not available.
    Returns live counters while status='running' and final counts when done.
    """
    result = await db.execute(select(BatchRun).where(BatchRun.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch run {batch_id} not found.",
        )
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=_batch_to_response(batch),
        message=f"Batch {batch_id} — status: {batch.status}",
    )


def _batch_to_response(batch: BatchRun) -> "BatchRunResponse":
    failed_ids: list[str] = []
    errors: dict = {}
    try:
        if batch.failed_lead_ids:
            failed_ids = json.loads(batch.failed_lead_ids)
        if batch.error_summary:
            errors = json.loads(batch.error_summary)
    except Exception:
        pass

    total = batch.total or 0
    processed = batch.processed_count or 0
    return BatchRunResponse(
        batch_id=str(batch.id),
        status=batch.status,
        total=total,
        total_new=batch.total_new or 0,
        total_dormant=batch.total_dormant or 0,
        processed_count=processed,
        success_count=batch.success_count or 0,
        failed_count=batch.failed_count or 0,
        pct=round(processed / total * 100) if total else 0,
        failed_lead_ids=failed_ids,
        error_summary=errors,
        started_at=str(batch.started_at) if batch.started_at else None,
        completed_at=str(batch.completed_at) if batch.completed_at else None,
    )


@router.post(
    "/events/track",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def track_engagement_event(
    request: EventTrackRequest,
    _: dict = Depends(require_permission("edit_lead")),
    db: AsyncSession = Depends(get_db),
):
    """Event Tracking API — simulates customer engagement inputs.

    Updates the LangGraph checkpoint state AND writes the engagement
    timestamp to the Communications table (internal mock event store).
    """
    try:
        config = {"configurable": {"thread_id": request.thread_id}}

        # Must use the persistent checkpointer — NOT a fresh MemorySaver
        async with get_checkpointer() as cp:
            graph = build_graph(db_session=db, checkpointer=cp)
            state_snapshot = await graph.aget_state(config)

            if not state_snapshot or not state_snapshot.values:
                raise HTTPException(
                    status_code=404, detail="Active workflow not found."
                )

            current_state = state_snapshot.values
            now = datetime.now(timezone.utc)

            # All trackable events + their score deltas (mirrors scoring_rules.py)
            _SCORE_MAP = {
                "email_opened": 0.10,
                "email_clicked": 0.15,
                "consult_page_visit": 0.40,
                "consultation_booked": 0.50,  # triggers immediate handoff path
                "seminar_inquiry": 0.20,  # S3 bonus
                "f2f_request": 0.30,  # S3 bonus
                "direct_reply": 0.25,
                # Negative / neutral — no score change
                "unsubscribe": 0.0,
                "bounce": 0.0,
            }
            score_increment = _SCORE_MAP.get(request.event_type, 0.0)

            new_score = round(
                current_state.get("engagement_score", 0.0) + score_increment, 4
            )

            # Build the state patch to inject back into the checkpoint
            state_patch: dict = {"engagement_score": new_score}

            # For S5 CTA clicks: update product_interest so A4 generates the right content
            if request.event_type == "email_clicked" and request.clicked_label:
                _label_to_interest = {
                    "Medical Insurance": "medical_insurance",
                    "Life Insurance": "life_insurance",
                    "Asset Formation": "asset_formation",
                }
                mapped = _label_to_interest.get(request.clicked_label)
                if mapped:
                    state_patch["product_interest"] = mapped
                    logger.info(
                        "S5 CTA click detected — product_interest set to '%s' for lead thread %s",
                        mapped,
                        request.thread_id,
                    )

            # consultation_booked → immediate handoff signal in state
            if request.event_type == "consultation_booked":
                state_patch["consultation_booked"] = True
                logger.info(
                    "Consultation booked — thread %s score → %.2f",
                    request.thread_id,
                    new_score,
                )

            # Inject all updates into the persistent checkpoint
            await graph.aupdate_state(config, state_patch)

        # Update Communications + create EmailEvent + update Lead score
        if request.event_type in (
            "email_opened",
            "email_clicked",
            "unsubscribe",
            "bounce",
            "seminar_inquiry",
            "consult_page_visit",
            "consultation_booked",
            "f2f_request",
            "direct_reply",
        ):
            lead_result = await db.execute(
                select(Lead).where(Lead.thread_id == request.thread_id)
            )
            lead = lead_result.scalars().first()
            if lead:
                # Find the latest sent email for this lead
                comm_result = await db.execute(
                    select(Communication)
                    .where(Communication.lead_id == lead.id)
                    .order_by(Communication.sent_at.desc())
                    .limit(1)
                )
                comm = comm_result.scalars().first()
                email_num = comm.email_number if comm else 0

                if comm:
                    if request.event_type == "email_opened" and comm.opened_at is None:
                        comm.opened_at = now
                    elif request.event_type == "email_clicked":
                        if comm.clicked_at is None:
                            comm.clicked_at = now
                        # Store which CTA was clicked (first click wins for dedup)
                        if request.clicked_url and comm.clicked_cta_url is None:
                            comm.clicked_cta_url = request.clicked_url
                        if request.clicked_label and comm.clicked_cta_label is None:
                            comm.clicked_cta_label = request.clicked_label
                    elif request.event_type == "unsubscribe":
                        comm.unsubscribed_at = now
                    elif request.event_type == "bounce":
                        comm.bounced_at = now
                    await db.commit()

                # Unsubscribe / hard bounce → OPT_IN=True + Suppressed permanently (spec)
                if request.event_type in ("unsubscribe", "bounce"):
                    await db.execute(
                        sa_update(Lead)
                        .where(Lead.id == lead.id)
                        .values(opt_in=True, workflow_status="Suppressed")
                    )
                    await db.commit()
                    logger.info(
                        "Lead %s suppressed permanently (%s)",
                        lead.id,
                        request.event_type,
                    )

                # Write EmailEvent row so the full engagement history is auditable
                db.add(
                    EmailEvent(
                        lead_id=lead.id,
                        communication_id=comm.id if comm else None,
                        event_type=request.event_type,
                        score_delta=score_increment,
                        email_number=email_num,
                        # Capture CTA click details when provided
                        clicked_url=request.clicked_url
                        if request.event_type == "email_clicked"
                        else None,
                        clicked_label=request.clicked_label
                        if request.event_type == "email_clicked"
                        else None,
                    )
                )

                # Update engagement_score + last_active_at on the Lead row.
                # last_active_at tracks lead-initiated activity for 180-day dormancy check.
                lead_updates: dict = {"engagement_score": new_score}
                if request.event_type not in ("unsubscribe", "bounce"):
                    # Only positive engagement events reset the 180-day clock
                    lead_updates["last_active_at"] = now
                await db.execute(
                    sa_update(Lead).where(Lead.id == lead.id).values(**lead_updates)
                )
                await db.commit()

        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data={
                "thread_id": request.thread_id,
                "event_logged": request.event_type,
                "score_boost": score_increment,
                "new_score": new_score,
            },
            message=f"Event '{request.event_type}' ingested into graph state.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Event ingestion failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest event: {str(e)}",
        )


@router.get(
    "/state/{thread_id}",
    response_model=APIResponse[WorkflowStateResponse],
    status_code=status.HTTP_200_OK,
)
async def get_workflow_state(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Full LangGraph checkpoint state inspector.

    Returns every field stored in the checkpoint for a given thread —
    useful for the Lead Detail screen, debugging, and the admin audit panel.
    """
    try:
        config = {"configurable": {"thread_id": thread_id}}
        async with get_checkpointer() as cp:
            graph = build_graph(db_session=db, checkpointer=cp)
            snapshot = await graph.aget_state(config)

        if not snapshot or not snapshot.values:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No checkpoint found for thread {thread_id}",
            )

        s = snapshot.values
        raw_log = s.get("execution_log", [])
        parsed_log = []
        for entry in raw_log:
            try:
                parsed_log.append(ExecutionLogEntry(**entry))
            except Exception:
                pass

        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data=WorkflowStateResponse(
                thread_id=thread_id,
                lead_id=s.get("lead_id"),
                scenario=s.get("scenario"),
                persona_code=s.get("persona_code"),
                persona_confidence=s.get("persona_confidence"),
                keigo_level=s.get("keigo_level"),
                engagement_score=s.get("engagement_score", 0.0),
                base_score=s.get("base_score", 0.0),
                handoff_threshold=s.get("handoff_threshold", 0.80),
                email_number=s.get("email_number", 0),
                max_emails=s.get("max_emails", 5),
                content_type=s.get("content_type"),
                draft_email_subject=s.get("draft_email_subject"),
                intent_summary=s.get("intent_summary"),
                urgency=s.get("urgency"),
                product_interest=s.get("product_interest"),
                hitl_gate=s.get("hitl_gate"),
                hitl_status=s.get("hitl_status"),
                hitl_resume_value=s.get("hitl_resume_value"),
                workflow_status=s.get("workflow_status"),
                current_node=s.get("current_node"),
                revival_segment=s.get("revival_segment"),
                is_converted=s.get("is_converted", False),
                target_language=s.get("target_language", "JA"),
                execution_log=parsed_log,
            ),
            message="Workflow state retrieved successfully.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch workflow state: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch workflow state: {str(e)}",
        )
