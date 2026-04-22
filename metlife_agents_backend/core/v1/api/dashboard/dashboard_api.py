"""
API endpoints for Dashboard metrics and Aggregations.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from model.api.v1 import APIResponse
from model.api.v1.dashboard import DashboardStatsResponse
from model.database.v1.leads import Lead
from utils.v1.connections import get_db
from utils.v1.dependencies import require_permission
from utils.v1.enums import DefaultPermission

logger = logging.getLogger(__name__)
router = APIRouter()
_EXPORT_DATA = DefaultPermission.EXPORT_DATA.value


@router.get(
    "/stats",
    response_model=APIResponse[DashboardStatsResponse],
    status_code=status.HTTP_200_OK,
)
async def get_dashboard_stats(
    _: dict = Depends(require_permission(_EXPORT_DATA)),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated metrics for the orchestration dashboard.

    Returns counts grouping leads by workflow_status, current_agent_node,
    and scenario_id so the frontend funnel, stat cards, and scenario bars
    all have real data.
    """
    # 1. Total Status Counts
    status_query = select(Lead.workflow_status, func.count(Lead.id)).group_by(
        Lead.workflow_status
    )
    status_res = await db.execute(status_query)
    status_counts = dict(status_res.all())

    # 2. Node Counts (for active leads)
    node_query = (
        select(Lead.current_agent_node, func.count(Lead.id))
        .where(Lead.workflow_status.in_(["Active", "Processing"]))
        .group_by(Lead.current_agent_node)
    )
    node_res = await db.execute(node_query)
    node_counts = {k: v for k, v in dict(node_res.all()).items() if k is not None}

    # 3. Scenario Breakdown (all leads, regardless of status)
    scenario_query = (
        select(Lead.scenario_id, func.count(Lead.id))
        .where(Lead.scenario_id.isnot(None))
        .group_by(Lead.scenario_id)
    )
    scenario_res = await db.execute(scenario_query)
    scenario_breakdown = {
        k: v for k, v in dict(scenario_res.all()).items() if k is not None
    }

    stats = DashboardStatsResponse(
        total_leads=sum(status_counts.values()),
        active_leads=status_counts.get("Active", 0)
        + status_counts.get("Processing", 0),
        hitl_leads=status_counts.get("Pending_HITL", 0) + status_counts.get("HITL", 0),
        converted_leads=status_counts.get("Converted", 0),
        dormant_leads=status_counts.get("Dormant", 0),
        suppressed_leads=status_counts.get("Suppressed", 0),
        node_counts=node_counts,
        scenario_breakdown=scenario_breakdown,
    )

    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        data=stats,
        message="Dashboard stats retrieved successfully.",
    )
