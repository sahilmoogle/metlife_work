"""
Pydantic models for the Dashboard API.
"""

from pydantic import BaseModel


class DashboardStatsResponse(BaseModel):
    total_leads: int
    active_leads: int
    hitl_leads: int
    hitl_distinct_leads: int  # unique lead_ids with an Awaiting row in hitl_queue
    converted_leads: int
    dormant_leads: int
    suppressed_leads: int
    node_counts: dict[str, int]
    scenario_breakdown: dict[str, int]  # S1–S7 lead counts
    scenario_unknown: int  # leads with scenario_id IS NULL
