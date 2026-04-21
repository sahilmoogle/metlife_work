"""
DB Sync Utility — writes LangGraph state back to the leads table.

Called from agent nodes that have a DB session so the leads table,
dashboard queries, and the UI table/detail screen always reflect
the current workflow state.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.leads import Lead

logger = logging.getLogger(__name__)


async def sync_lead_state(
    db: AsyncSession,
    lead_id: str,
    **fields: Any,
) -> None:
    """Persist a partial set of Lead columns from workflow state.

    Only non-None values are written to avoid accidentally nulling columns.

    Usage:
        await sync_lead_state(db, lead_id, workflow_status="Active",
                              scenario_id="S1", engagement_score=0.45)
    """
    payload = {k: v for k, v in fields.items() if v is not None}
    if not payload:
        return

    try:
        stmt = sa_update(Lead).where(Lead.id == lead_id).values(**payload)
        await db.execute(stmt)
        await db.commit()
        logger.debug("sync_lead_state: lead=%s updated=%s", lead_id, list(payload))
    except Exception as exc:
        logger.warning("sync_lead_state failed for lead %s: %s", lead_id, exc)
