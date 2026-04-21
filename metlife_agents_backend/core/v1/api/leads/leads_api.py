"""
API endpoints for listing and viewing detailed Lead profiles.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from model.api.v1 import APIResponse
from model.api.v1.leads import LeadSummaryResponse, LeadDetailResponse
from model.database.v1.leads import Lead
from utils.v1.connections import get_db
from core.v1.services.agents.graph import build_graph, get_checkpointer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "",
    response_model=APIResponse[list[LeadSummaryResponse]],
    status_code=status.HTTP_200_OK,
)
async def get_all_leads(
    db: AsyncSession = Depends(get_db),
):
    """Get summarized grid data for all leads.

    Used by the frontend to populate the 'All Leads' table view.
    """
    query = select(Lead).order_by(Lead.updated_at.desc())
    result = await db.execute(query)
    records = result.scalars().all()

    items = [
        LeadSummaryResponse(
            id=str(r.id),
            name=f"{r.first_name} {r.last_name}" if r.first_name else "Unknown",
            email=r.email or "",
            scenario_id=r.scenario_id,
            persona_code=r.persona_code,
            engagement_score=r.engagement_score,
            workflow_status=r.workflow_status,
            current_agent_node=r.current_agent_node,
            last_activity=str(r.updated_at),
        )
        for r in records
    ]

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=items,
        message="Leads retrieved successfully.",
    )


@router.get(
    "/{thread_id}/detail",
    response_model=APIResponse[LeadDetailResponse],
    status_code=status.HTTP_200_OK,
)
async def get_lead_detail(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the comprehensive state of a lead.

    Combines native database columns with deep state variables extracted
    from the LangGraph Checkpointer (like AI insights and intents).
    """
    # 1. Fetch native Lead DB Record
    query = select(Lead).where(Lead.thread_id == thread_id)
    result = await db.execute(query)
    lead = result.scalars().first()

    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # 2. Fetch Deep State for insights
    intent_summary = None
    urgency = None
    interest = None

    try:
        config = {"configurable": {"thread_id": thread_id}}
        async with get_checkpointer() as cp:
            graph = build_graph(db_session=db, checkpointer=cp)
            state_snapshot = await graph.aget_state(config)

            if state_snapshot and state_snapshot.values:
                state = state_snapshot.values
                intent_summary = state.get("intent_summary")
                urgency = state.get("urgency")
                interest = state.get("interest")
    except Exception as e:
        logger.warning(f"Could not load state snapshot for lead details: {e}")

    response_data = LeadDetailResponse(
        id=str(lead.id),
        first_name=lead.first_name or "",
        last_name=lead.last_name or "",
        email=lead.email or "",
        age=lead.age,
        device_type=lead.device_type,
        scenario_id=lead.scenario_id,
        persona_code=lead.persona_code,
        persona_confidence=lead.persona_confidence,
        ans3=lead.ans3,
        ans4=lead.ans4,
        ans5=lead.ans5,
        keigo_level=lead.keigo_level,
        engagement_score=lead.engagement_score,
        workflow_status=lead.workflow_status,
        thread_id=lead.thread_id,
        intent_summary=intent_summary,
        urgency=urgency,
        interest=interest,
    )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=response_data,
        message="Lead details retrieved successfully.",
    )
