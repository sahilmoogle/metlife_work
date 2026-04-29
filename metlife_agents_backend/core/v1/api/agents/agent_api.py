"""
Agent Workflow API — start, pause, and monitor agent workflows.
"""

import json
import logging
import uuid
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
    BatchRunRequest,
    IntakeQuoteRequest,
    IntakeConsultationRequest,
    TrackClickRequest,
    ScenarioConfigUpdateRequest,
)
from model.database.v1.leads import Lead
from model.database.v1.quotes import Quote
from model.database.v1.consultation import ConsultationRequest
from model.database.v1.scenarios import ScenarioConfig
from model.database.v1.communications import Communication
from model.database.v1.emails import EmailEvent
from model.database.v1.batch_runs import BatchRun
from model.database.v1.hitl import HITLQueue
from model.database.v1.email_outbox import EmailOutbox
from model.database.v1.workflow_timers import WorkflowTimer
from core.v1.services.agents.graph import (
    start_workflow,
    resume_workflow,
    build_graph,
    get_checkpointer,
    patch_checkpoint_state,
    jump_to_node,
)
from core.v1.services.agents.nodes.hitl_gates import persist_hitl_record
from core.v1.services.agents.nodes.sales_handoff import sales_handoff
from core.v1.services.sse.manager import event_manager, batch_progress_event
from config.v1.llm_config import get_llm
from utils.v1.connections import get_db
from utils.v1.permissions import require_permission
from config.v1.database_config import db_config

logger = logging.getLogger(__name__)

router = APIRouter()


def _is_valid_phone(phone: str | None) -> bool:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return len(digits) >= 7


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


@router.post(
    "/intake/quote",
    response_model=APIResponse[dict],
    status_code=status.HTTP_201_CREATED,
)
async def intake_quote(
    request: IntakeQuoteRequest,
    _: dict = Depends(require_permission("start_agent")),
    db: AsyncSession = Depends(get_db),
):
    """Internal quote intake endpoint replacing source-system webhooks in demo mode."""
    lead_id = uuid.uuid4()
    lead = Lead(
        id=lead_id,
        quote_id=request.quote_id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        phone=request.phone,
        age=request.age,
        gender=request.gender,
        ans3=request.ans3,
        ans4=request.ans4,
        ans5=request.ans5,
        product_code=request.product_code,
        plan_code=request.plan_code,
        banner_code=request.banner_code,
        registration_source=request.registration_source,
        opt_in=False,
        is_converted=False,
        cooldown_flag=False,
        workflow_status="New",
        engagement_score=0.0,
        base_score=0.0,
        emails_sent_count=0,
        max_emails=5,
        workflow_completed=False,
        commit_time=datetime.now(timezone.utc),
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(lead)
    db.add(
        Quote(
            lead_id=lead_id,
            product_code=request.product_code,
            premium_estimate_jpy=request.premium_estimate_jpy,
            raw_quote_ref=request.quote_id,
        )
    )
    await db.commit()

    workflow = None
    if request.start_workflow:
        workflow = await start_workflow(lead_id=str(lead_id), db_session=db)

    return APIResponse(
        success=True,
        status_code=status.HTTP_201_CREATED,
        data={
            "lead_id": str(lead_id),
            "thread_id": workflow.get("thread_id") if workflow else None,
            "started": bool(workflow),
        },
        message="Quote intake accepted.",
    )


@router.post(
    "/intake/consultation",
    response_model=APIResponse[dict],
    status_code=status.HTTP_201_CREATED,
)
async def intake_consultation(
    request: IntakeConsultationRequest,
    _: dict = Depends(require_permission("start_agent")),
    db: AsyncSession = Depends(get_db),
):
    """Internal consultation/seminar intake endpoint for S6/S7 source events."""
    lead_id = uuid.uuid4()
    registration_source = (
        "f2f_form" if request.request_type == "face_to_face" else "web_callback"
    )
    lead = Lead(
        id=lead_id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        phone=request.phone,
        gender=request.gender,
        date_of_birth=request.date_of_birth,
        registration_source=registration_source,
        opt_in=False,
        is_converted=False,
        cooldown_flag=False,
        workflow_status="New",
        engagement_score=0.0,
        base_score=0.0,
        emails_sent_count=0,
        max_emails=1,
        workflow_completed=False,
        commit_time=datetime.now(timezone.utc),
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(lead)
    db.add(
        ConsultationRequest(
            lead_id=lead_id,
            form_id=request.form_id,
            request_id=request.request_id,
            request_type=request.request_type,
            email=request.email,
            phone=request.phone,
            gender=request.gender,
            date_of_birth=request.date_of_birth,
            memo=request.memo,
            face_to_face=request.request_type == "face_to_face",
            email_captured=bool(request.email),
            campaign_code=request.campaign_code,
        )
    )
    await db.commit()

    workflow = None
    if request.start_workflow:
        workflow = await start_workflow(lead_id=str(lead_id), db_session=db)

    return APIResponse(
        success=True,
        status_code=status.HTTP_201_CREATED,
        data={
            "lead_id": str(lead_id),
            "thread_id": workflow.get("thread_id") if workflow else None,
            "started": bool(workflow),
        },
        message="Consultation intake accepted.",
    )


@router.post(
    "/intake/seminar",
    response_model=APIResponse[dict],
    status_code=status.HTTP_201_CREATED,
)
async def intake_seminar(
    request: IntakeConsultationRequest,
    _: dict = Depends(require_permission("start_agent")),
    db: AsyncSession = Depends(get_db),
):
    request.request_type = "seminar"
    return await intake_consultation(request, _, db)


@router.post(
    "/track/click",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def track_internal_click(
    request: TrackClickRequest,
    current_user: dict = Depends(require_permission("edit_lead")),
    db: AsyncSession = Depends(get_db),
):
    """Demo/internal tracked-link endpoint that records a CTA click."""
    return await track_engagement_event(
        EventTrackRequest(
            thread_id=request.thread_id,
            event_type="email_clicked",
            clicked_label=request.clicked_label,
            clicked_url=request.clicked_url,
        ),
        current_user,
        db,
    )


@router.get(
    "/scenarios/config",
    response_model=APIResponse[list[dict]],
    status_code=status.HTTP_200_OK,
)
async def list_scenario_config(
    _: dict = Depends(require_permission("run_workflow")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScenarioConfig).order_by(ScenarioConfig.scenario_id)
    )
    rows = result.scalars().all()
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=[
            {
                "scenario_id": row.scenario_id,
                "name": row.name,
                "base_score": row.base_score,
                "handoff_threshold": row.handoff_threshold,
                "cadence_days": row.cadence_days,
                "max_emails": row.max_emails,
                "default_keigo": row.default_keigo,
                "default_tone": row.default_tone,
                "is_active": row.is_active,
            }
            for row in rows
        ],
        message=f"{len(rows)} scenario config row(s).",
    )


@router.patch(
    "/scenarios/config/{scenario_id}",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def update_scenario_config(
    scenario_id: str,
    request: ScenarioConfigUpdateRequest,
    _: dict = Depends(require_permission("run_workflow")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScenarioConfig).where(ScenarioConfig.scenario_id == scenario_id)
    )
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario config not found.")

    updates = request.model_dump(exclude_unset=True)
    if "base_score" in updates and not 0 <= updates["base_score"] <= 1:
        raise HTTPException(status_code=400, detail="base_score must be 0..1")
    if "handoff_threshold" in updates and not 0 <= updates["handoff_threshold"] <= 1:
        raise HTTPException(status_code=400, detail="handoff_threshold must be 0..1")
    if "max_emails" in updates and updates["max_emails"] < 1:
        raise HTTPException(status_code=400, detail="max_emails must be >= 1")
    if "cadence_days" in updates and updates["cadence_days"] < 0:
        raise HTTPException(status_code=400, detail="cadence_days must be >= 0")

    await db.execute(
        sa_update(ScenarioConfig)
        .where(ScenarioConfig.scenario_id == scenario_id)
        .values(**updates)
    )
    await db.commit()
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data={"scenario_id": scenario_id, "updated": updates},
        message="Scenario config updated.",
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
    request: BatchRunRequest | None = None,
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

    requested_ids = {
        str(x).strip()
        for x in ((request.lead_ids if request else []) or [])
        if str(x).strip()
    }

    eligibility_query = select(
        Lead.id,
        Lead.last_active_at,
        Lead.cooldown_flag,
        Lead.commit_time,
        Lead.thread_id,
        Lead.workflow_completed,
        Lead.completed_at,
    ).where(
        Lead.opt_in == False,  # noqa: E712
        Lead.is_converted == False,  # noqa: E712
        sa.or_(
            Lead.thread_id.is_(None),
            Lead.workflow_completed.is_(True),
        ),
    )
    if requested_ids:
        eligibility_query = eligibility_query.where(Lead.id.in_(list(requested_ids)))

    eligible_result = await db.execute(eligibility_query.order_by(Lead.id.asc()))

    standard_lead_ids: list[str] = []
    dormant_lead_ids: list[str] = []
    for (
        lid,
        la,
        cooldown,
        commit_t,
        thread_id,
        workflow_completed,
        completed_at,
    ) in eligible_result.all():
        lid_str = str(lid)
        la_u = _naive_utc(la)
        commit_u = _naive_utc(commit_t)
        completed_u = _naive_utc(completed_at)
        stale_by_activity = la_u is not None and la_u <= dormancy_cutoff
        stale_by_commit_only = (
            la_u is None and commit_u is not None and commit_u <= dormancy_cutoff
        )
        completed_long_enough = not workflow_completed or (
            completed_u is not None and completed_u <= dormancy_cutoff
        )
        revival = (
            cooldown is not True
            and completed_long_enough
            and (stale_by_activity or stale_by_commit_only)
        )
        if revival:
            dormant_lead_ids.append(lid_str)
        elif thread_id is None and not workflow_completed:
            standard_lead_ids.append(lid_str)

    new_lead_ids = standard_lead_ids
    total = len(new_lead_ids) + len(dormant_lead_ids)
    if total == 0:
        mode_suffix = " among selected leads" if requested_ids else " for batch"
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
            message=(
                "No eligible leads found"
                f"{mode_suffix} (opt-out, converted, or in-flight thread without completion)."
            ),
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
            f"{'Selected-lead mode. ' if requested_ids else ''}"
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


def _payload_value(payload: str | None, key: str) -> str | None:
    """Read a simple key=value entry from a semicolon-delimited timer payload."""
    for chunk in str(payload or "").split(";"):
        if "=" not in chunk:
            continue
        k, value = chunk.split("=", 1)
        if k.strip() == key:
            return value.strip() or None
    return None


@router.post(
    "/scheduler/process-due",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def process_due_workflow_timers(
    limit: int = 25,
    _: dict = Depends(require_permission("run_workflow")),
    db: AsyncSession = Depends(get_db),
):
    """Process due internal timers for no-external-service operation.

    Handles quiet-hour held emails and cadence / S4 response-window resumes.
    This endpoint can be called manually in local/demo mode or by a lightweight
    cron later.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(WorkflowTimer)
        .where(WorkflowTimer.status == "pending")
        .where(WorkflowTimer.due_at <= now)
        .order_by(WorkflowTimer.due_at.asc())
        .limit(limit)
    )
    timers = list(result.scalars().all())

    processed: list[dict] = []
    failed: list[dict] = []

    for timer in timers:
        timer_pk = timer.id
        timer_id = str(timer_pk)
        timer_type = timer.timer_type
        timer_thread_id = timer.thread_id
        timer_payload = timer.payload
        try:
            await db.execute(
                sa_update(WorkflowTimer)
                .where(WorkflowTimer.id == timer_pk)
                .where(WorkflowTimer.status == "pending")
                .values(status="processing")
            )
            await db.commit()

            target_node = "content_strategist"
            state_patch: dict = {
                "workflow_status": "active",
                "send_deferred": False,
            }

            if timer_type == "quiet_hours":
                outbox_id = _payload_value(timer_payload, "outbox_id")
                outbox = None
                if outbox_id:
                    outbox_result = await db.execute(
                        select(EmailOutbox).where(EmailOutbox.id == outbox_id).limit(1)
                    )
                    outbox = outbox_result.scalars().first()

                if outbox is None:
                    outbox_result = await db.execute(
                        select(EmailOutbox)
                        .where(EmailOutbox.thread_id == timer_thread_id)
                        .where(EmailOutbox.status == "held")
                        .order_by(EmailOutbox.scheduled_for.asc())
                        .limit(1)
                    )
                    outbox = outbox_result.scalars().first()

                if outbox is None:
                    raise ValueError("No held outbox item found for quiet-hours timer")

                target_node = "send_engine"
                state_patch.update(
                    {
                        "held_outbox_id": str(outbox.id),
                        "draft_email_subject": outbox.subject,
                        "draft_email_subject_en": outbox.subject_en,
                        "draft_email_body": outbox.body,
                        "template_name": outbox.template_name,
                        "email_number": outbox.email_number or 0,
                        "content_type": outbox.content_type or "unknown",
                    }
                )
            elif timer_type == "s4_response_window":
                lead_result = await db.execute(
                    select(Lead).where(Lead.thread_id == timer_thread_id).limit(1)
                )
                lead = lead_result.scalars().first()
                if lead and lead.is_converted:
                    await db.execute(
                        sa_update(WorkflowTimer)
                        .where(WorkflowTimer.id == timer_pk)
                        .values(status="fired")
                    )
                    await db.commit()
                    processed.append(
                        {
                            "timer_id": timer_id,
                            "thread_id": timer_thread_id,
                            "timer_type": timer_type,
                            "target_node": "none",
                            "workflow_status": "Converted",
                            "hitl_gate": None,
                        }
                    )
                    continue
            elif timer_type not in ("cadence", "s4_response_window"):
                raise ValueError(f"Unsupported timer_type={timer_type}")

            run_result = await jump_to_node(
                timer_thread_id,
                target_node,
                db_session=db,
                state_patch=state_patch,
            )
            state = run_result.get("state", {})

            await db.execute(
                sa_update(WorkflowTimer)
                .where(WorkflowTimer.id == timer_pk)
                .values(status="fired")
            )
            await db.commit()

            processed.append(
                {
                    "timer_id": timer_id,
                    "thread_id": timer_thread_id,
                    "timer_type": timer_type,
                    "target_node": target_node,
                    "workflow_status": state.get("workflow_status"),
                    "hitl_gate": state.get("hitl_gate"),
                }
            )
        except Exception as exc:
            await db.rollback()
            logger.error("Timer %s failed: %s", timer_id, exc, exc_info=True)
            await db.execute(
                sa_update(WorkflowTimer)
                .where(WorkflowTimer.id == timer_pk)
                .values(status="failed")
            )
            await db.commit()
            failed.append(
                {
                    "timer_id": timer_id,
                    "thread_id": timer_thread_id,
                    "timer_type": timer_type,
                    "error": str(exc),
                }
            )

    return APIResponse(
        success=len(failed) == 0,
        status_code=status.HTTP_200_OK,
        data={
            "due_count": len(timers),
            "processed_count": len(processed),
            "failed_count": len(failed),
            "processed": processed,
            "failed": failed,
        },
        message=f"Processed {len(processed)} due timer(s); {len(failed)} failed.",
    )


async def _open_event_driven_handoff_if_ready(
    *,
    db: AsyncSession,
    thread_id: str,
    state: dict,
    event_type: str,
    new_score: float,
) -> bool:
    """Create A9/G4 handoff when an internal event crosses the threshold."""
    threshold = float(state.get("handoff_threshold", 0.80) or 0.80)
    ready = event_type == "consultation_booked" or new_score >= threshold
    if not ready:
        return False

    existing = await db.execute(
        select(HITLQueue)
        .where(HITLQueue.thread_id == thread_id)
        .where(HITLQueue.gate_type == "G4")
        .where(HITLQueue.review_status == "Awaiting")
        .limit(1)
    )
    if existing.scalars().first() is not None:
        return False

    handoff_state = {
        **state,
        "engagement_score": new_score,
        "consultation_booked": event_type == "consultation_booked"
        or state.get("consultation_booked", False),
    }
    handoff_state = await sales_handoff(handoff_state, llm=get_llm(), db=db)
    await persist_hitl_record(handoff_state, "G4", "Sales Handoff Review", db=db)

    config = {"configurable": {"thread_id": thread_id}}
    async with get_checkpointer() as cp:
        graph = build_graph(db_session=db, checkpointer=cp)
        await patch_checkpoint_state(graph, config, handoff_state)

    return True


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
        handoff_opened = False
        patched_state: dict = {}
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

            # Build the state patch to inject back into the checkpoint.
            # The graph route is then resumed through A3 -> A8 so engagement
            # events leave a real workflow trace, not only a direct score patch.
            state_patch: dict = {
                "engagement_score": new_score,
                "event_pending_route": True,
                "last_event_type": request.event_type,
                "last_event_at": now.isoformat(),
                "last_clicked_label": request.clicked_label,
            }
            if request.event_type not in ("unsubscribe", "bounce"):
                state_patch["preferred_send_hour_jst"] = now.astimezone(
                    timezone(timedelta(hours=9))
                ).hour

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

            # Inject all updates into the persistent checkpoint without
            # replacing the rest of the dict state.
            patched_state = await patch_checkpoint_state(graph, config, state_patch)

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
                lead_id = lead.id
                # Find the latest sent email for this lead
                comm_result = await db.execute(
                    select(Communication)
                    .where(Communication.lead_id == lead_id)
                    .order_by(Communication.sent_at.desc())
                    .limit(1)
                )
                comm = comm_result.scalars().first()
                email_num = comm.email_number if comm else 0
                comm_id = comm.id if comm else None

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
                    lead_patch: dict = {
                        "opt_in": True,
                        "workflow_status": "Suppressed",
                    }
                    if request.event_type == "bounce" and not _is_valid_phone(
                        lead.phone
                    ):
                        state_patch["data_quality_flag"] = True
                        state_patch["data_quality_reason"] = (
                            "Email bounced and phone is missing or invalid."
                        )
                        existing_dq = await db.execute(
                            select(HITLQueue)
                            .where(HITLQueue.thread_id == request.thread_id)
                            .where(HITLQueue.gate_type == "DQ")
                            .where(HITLQueue.review_status == "Awaiting")
                            .limit(1)
                        )
                        if existing_dq.scalars().first() is None:
                            db.add(
                                HITLQueue(
                                    lead_id=lead_id,
                                    thread_id=request.thread_id,
                                    gate_type="DQ",
                                    gate_description="Data Quality Manual Review",
                                    suggested_persona="data_quality_review",
                                    persona_confidence=0.0,
                                    reviewer_notes=(
                                        "Email bounced and phone is missing or invalid."
                                    ),
                                )
                            )
                    await db.execute(
                        sa_update(Lead).where(Lead.id == lead_id).values(**lead_patch)
                    )
                    await db.commit()
                    logger.info(
                        "Lead %s suppressed permanently (%s)",
                        lead_id,
                        request.event_type,
                    )

                # Write EmailEvent row so the full engagement history is auditable
                db.add(
                    EmailEvent(
                        lead_id=lead_id,
                        communication_id=comm_id,
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
                    sa_update(Lead).where(Lead.id == lead_id).values(**lead_updates)
                )
                await db.commit()

        routable_state = patched_state or {**current_state, **state_patch}
        should_route_event = (
            request.event_type not in ("unsubscribe", "bounce")
            and routable_state.get("hitl_status") != "pending"
        )
        if should_route_event:
            run_result = await jump_to_node(
                request.thread_id,
                "intent_analyser",
                db_session=db,
                state_patch=state_patch,
            )
            routed_state = run_result.get("state", {})
            handoff_opened = routed_state.get("hitl_gate") == "G4"
        else:
            handoff_opened = await _open_event_driven_handoff_if_ready(
                db=db,
                thread_id=request.thread_id,
                state=routable_state,
                event_type=request.event_type,
                new_score=new_score,
            )

        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data={
                "thread_id": request.thread_id,
                "event_logged": request.event_type,
                "score_boost": score_increment,
                "new_score": new_score,
                "handoff_opened": handoff_opened,
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
