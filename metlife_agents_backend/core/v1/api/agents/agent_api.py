"""
Agent Workflow API — start, pause, and monitor agent workflows.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1 import APIResponse
from model.api.v1.agents import (
    StartWorkflowRequest,
    StartWorkflowResponse,
    ResumeWorkflowRequest,
    EventTrackRequest,
)
from model.database.v1.leads import Lead
from core.v1.services.agents.graph import start_workflow, resume_workflow
from utils.v1.connections import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/start",
    response_model=APIResponse[StartWorkflowResponse],
    status_code=status.HTTP_201_CREATED,
)
async def start_agent_workflow(
    request: StartWorkflowRequest,
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
    from core.v1.services.agents.graph import build_graph

    try:
        graph = build_graph(db_session=db)
        config = {"configurable": {"thread_id": thread_id}}

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


@router.post(
    "/batch/run",
    response_model=APIResponse[dict],
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_batch_orchestrator(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Batch Orchestrator — launches LangGraph threads for all pending leads.

    Queries all leads with workflow_status='New', then uses BackgroundTasks
    to fire up the agent workflows concurrently without blocking the UI.
    """
    result = await db.execute(select(Lead).where(Lead.workflow_status == "New"))
    leads = result.scalars().all()

    if not leads:
        return APIResponse(
            success=False,
            status_code=status.HTTP_200_OK,
            data={"leads_started": 0},
            message="No pending leads found to process.",
        )

    async def process_leads(leads_list):
        from config.v1.database_config import db_config
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy.orm import sessionmaker

        # Create a fresh isolated session for the background task
        db_url = db_config.get_database_url()
        engine = create_async_engine(db_url, echo=False)
        AsyncSessionLocal = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        async with AsyncSessionLocal() as bg_db:
            for lead in leads_list:
                try:
                    await start_workflow(
                        lead_id=str(lead.id),
                        db_session=bg_db,
                    )
                except Exception as e:
                    logger.error(f"Batch processing failed for lead {lead.id}: {e}")

    background_tasks.add_task(process_leads, leads)

    return APIResponse(
        success=True,
        status_code=status.HTTP_202_ACCEPTED,
        data={"leads_started": len(leads)},
        message=f"Batch orchestrator launched for {len(leads)} leads.",
    )


@router.post(
    "/events/track",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
)
async def track_engagement_event(
    request: EventTrackRequest,
    db: AsyncSession = Depends(get_db),
):
    """Event Tracking API — simulates customer engagement inputs.

    Resumes a paused workflow so the score engine (A8) can process
    the 'email_opened' or 'email_clicked' event.
    """
    try:
        from core.v1.services.agents.graph import build_graph

        graph = build_graph(db_session=db)
        config = {"configurable": {"thread_id": request.thread_id}}

        # Get current state
        state_snapshot = await graph.aget_state(config)
        if not state_snapshot or not state_snapshot.values:
            raise HTTPException(status_code=404, detail="Active workflow not found.")

        current_state = state_snapshot.values
        score_increment = 0.0

        if request.event_type == "email_opened":
            score_increment = 0.10
        elif request.event_type == "email_clicked":
            score_increment = 0.15

        # Natively update the langgraph state (simulating an external node injecting values)
        await graph.aupdate_state(
            config,
            {
                "engagement_score": round(
                    current_state.get("engagement_score", 0.0) + score_increment, 4
                )
            },
        )

        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data={
                "thread_id": request.thread_id,
                "event_logged": request.event_type,
                "score_boost": score_increment,
            },
            message=f"Event '{request.event_type}' ingested into graph state.",
        )
    except Exception as e:
        logger.error("Event ingestion failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest event: {str(e)}",
        )
