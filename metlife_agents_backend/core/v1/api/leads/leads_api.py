"""
API endpoints for listing and viewing detailed Lead profiles.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1 import APIResponse
from model.api.v1.leads import (
    LeadSummaryResponse,
    LeadDetailResponse,
    CommunicationEntry,
)
from model.database.v1.leads import Lead
from model.database.v1.communications import Communication
from utils.v1.connections import get_db
from core.v1.services.agents.graph import build_graph, get_checkpointer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "",
    response_model=APIResponse[list[LeadSummaryResponse]],
    status_code=status.HTTP_200_OK,
)
async def get_all_leads(db: AsyncSession = Depends(get_db)):
    """Paginated lead list for the All Leads table view."""
    result = await db.execute(select(Lead).order_by(Lead.updated_at.desc()))
    records = result.scalars().all()

    items = [
        LeadSummaryResponse(
            id=str(r.id),
            name=f"{r.first_name or ''} {r.last_name or ''}".strip() or "Unknown",
            email=r.email or "",
            scenario_id=r.scenario_id,
            persona_code=r.persona_code,
            engagement_score=r.engagement_score or 0.0,
            workflow_status=r.workflow_status or "New",
            current_agent_node=r.current_agent_node,
            thread_id=r.thread_id,
            last_activity=str(r.updated_at) if r.updated_at else "",
        )
        for r in records
    ]

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=items,
        message=f"{len(items)} leads retrieved.",
    )


@router.get(
    "/{lead_id}/detail",
    response_model=APIResponse[LeadDetailResponse],
    status_code=status.HTTP_200_OK,
)
async def get_lead_detail(lead_id: str, db: AsyncSession = Depends(get_db)):
    """Full lead profile — combines DB columns with LangGraph checkpoint state.

    Works before and after workflow start:
    - Before start: returns DB fields only (no AI insights yet)
    - After start:  also returns intent_summary, urgency, product_interest
                    from the LangGraph checkpoint via thread_id
    """
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalars().first()
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found"
        )

    # AI insights — only available after workflow has started
    intent_summary = urgency = product_interest = None
    if lead.thread_id:
        try:
            config = {"configurable": {"thread_id": lead.thread_id}}
            async with get_checkpointer() as cp:
                graph = build_graph(db_session=db, checkpointer=cp)
                snapshot = await graph.aget_state(config)
                if snapshot and snapshot.values:
                    s = snapshot.values
                    intent_summary = s.get("intent_summary")
                    urgency = s.get("urgency")
                    product_interest = s.get("product_interest")
        except Exception as exc:
            logger.warning(
                "Could not load LangGraph state for lead %s: %s", lead_id, exc
            )

    # Communication history
    comms_result = await db.execute(
        select(Communication)
        .where(Communication.lead_id == lead.id)
        .order_by(Communication.sent_at.asc())
    )
    communications = [
        CommunicationEntry(
            id=str(c.id),
            subject=c.subject,
            body_preview=c.body_preview,
            email_number=c.email_number,
            content_type=c.content_type,
            sent_at=str(c.sent_at) if c.sent_at else None,
            opened_at=str(c.opened_at) if c.opened_at else None,
            clicked_at=str(c.clicked_at) if c.clicked_at else None,
        )
        for c in comms_result.scalars().all()
    ]

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=LeadDetailResponse(
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
            engagement_score=lead.engagement_score or 0.0,
            workflow_status=lead.workflow_status or "New",
            thread_id=lead.thread_id,
            emails_sent_count=lead.emails_sent_count or 0,
            intent_summary=intent_summary,
            urgency=urgency,
            product_interest=product_interest,
            communications=communications,
        ),
        message="Lead detail retrieved.",
    )
