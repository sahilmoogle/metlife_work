"""
Email Templates API — browse and manage the pre-approved brand asset library.

Endpoints:
  GET  /templates                        list all (filter by scenario, language, active)
  GET  /templates/scenario/{scenario_id} templates for a specific scenario
  GET  /templates/{template_id}          full detail including body_html
  POST /templates                        create a new template (admin)
  PATCH /templates/{template_id}         update metadata / toggle active (admin)
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.emails import EmailTemplate
from model.api.v1.templates import (
    EmailTemplateCreate,
    EmailTemplateResponse,
    EmailTemplateSummary,
    EmailTemplateUpdate,
)
from utils.v1.connections import get_db
from utils.v1.jwt_utils import get_current_user

router = APIRouter()


def _to_summary(t: EmailTemplate) -> EmailTemplateSummary:
    return EmailTemplateSummary(
        id=str(t.id),
        scenario_id=t.scenario_id,
        persona_code=t.persona_code,
        template_name=t.template_name,
        subject=t.subject,
        keigo_level=t.keigo_level,
        language=t.language or "JA",
        version=t.version or 1,
        is_active=bool(t.is_active),
    )


def _to_response(t: EmailTemplate) -> EmailTemplateResponse:
    return EmailTemplateResponse(
        id=str(t.id),
        scenario_id=t.scenario_id,
        persona_code=t.persona_code,
        product_code=t.product_code,
        template_name=t.template_name,
        subject=t.subject,
        body_html=t.body_html,
        keigo_level=t.keigo_level,
        language=t.language or "JA",
        version=t.version or 1,
        is_active=bool(t.is_active),
        created_at=str(t.created_at) if t.created_at else None,
        updated_at=str(t.updated_at) if t.updated_at else None,
    )


@router.get("", response_model=list[EmailTemplateSummary])
async def list_templates(
    scenario_id: Optional[str] = Query(None, description="Filter by scenario: S1–S7"),
    language: Optional[str] = Query(None, description="Filter by language: JA or EN"),
    active_only: bool = Query(True, description="Return only active templates"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all email templates with optional filters."""
    stmt = select(EmailTemplate).order_by(
        EmailTemplate.scenario_id, EmailTemplate.version
    )
    if scenario_id:
        stmt = stmt.where(EmailTemplate.scenario_id == scenario_id.upper())
    if language:
        stmt = stmt.where(EmailTemplate.language == language.upper())
    if active_only:
        stmt = stmt.where(EmailTemplate.is_active == True)  # noqa: E712

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_to_summary(t) for t in rows]


@router.get("/scenario/{scenario_id}", response_model=list[EmailTemplateResponse])
async def templates_by_scenario(
    scenario_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Return all active templates for a given scenario, ordered by version (email sequence)."""
    stmt = (
        select(EmailTemplate)
        .where(EmailTemplate.scenario_id == scenario_id.upper())
        .where(EmailTemplate.is_active == True)  # noqa: E712
        .order_by(EmailTemplate.version)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No active templates found for scenario {scenario_id.upper()}.",
        )
    return [_to_response(t) for t in rows]


@router.get("/{template_id}", response_model=EmailTemplateResponse)
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Return full template detail including body_html."""
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return _to_response(template)


@router.post("", response_model=EmailTemplateResponse, status_code=201)
async def create_template(
    payload: EmailTemplateCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create a new email template (admin use)."""
    template = EmailTemplate(
        id=uuid.uuid4(),
        scenario_id=payload.scenario_id.upper(),
        persona_code=payload.persona_code,
        product_code=payload.product_code,
        template_name=payload.template_name,
        subject=payload.subject,
        body_html=payload.body_html,
        keigo_level=payload.keigo_level,
        language=payload.language.upper(),
        version=payload.version,
        is_active=payload.is_active,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _to_response(template)


@router.patch("/{template_id}", response_model=EmailTemplateResponse)
async def update_template(
    template_id: str,
    payload: EmailTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update template metadata or toggle active status (admin use)."""
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)
    return _to_response(template)
