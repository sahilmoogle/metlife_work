"""
Pydantic models for the Leads API.
"""

from typing import Optional
from pydantic import BaseModel


class LeadSummaryResponse(BaseModel):
    id: str
    name: str  # First + Last
    email: str
    scenario_id: Optional[str]
    persona_code: Optional[str]
    engagement_score: float
    workflow_status: str
    current_agent_node: Optional[str]
    last_activity: str


class LeadDetailResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    email: str
    age: Optional[int]
    device_type: Optional[str]
    scenario_id: Optional[str]
    persona_code: Optional[str]
    persona_confidence: Optional[float]
    ans3: Optional[str]
    ans4: Optional[str]
    ans5: Optional[str]
    keigo_level: Optional[str]
    engagement_score: float
    workflow_status: str
    thread_id: Optional[str]
    # AI Insights from State
    intent_summary: Optional[str] = None
    urgency: Optional[str] = None
    interest: Optional[str] = None
