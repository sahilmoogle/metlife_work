"""
Pydantic models for the Dashboard API.
"""

from pydantic import BaseModel


class DashboardStatsResponse(BaseModel):
    total_leads: int
    active_leads: int
    hitl_leads: int
    converted_leads: int
    dormant_leads: int
    node_counts: dict[str, int]
