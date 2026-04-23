"""
Pydantic models for the Leads API.
"""

from typing import Optional
from pydantic import BaseModel

from model.api.v1.agents import ExecutionLogEntry


class CommunicationEntry(BaseModel):
    id: str
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    email_number: Optional[int] = None
    content_type: Optional[str] = None
    sent_at: Optional[str] = None
    opened_at: Optional[str] = None
    clicked_at: Optional[str] = None


class LeadSummaryResponse(BaseModel):
    id: str
    name: str
    email: str
    scenario_id: Optional[str] = None
    persona_code: Optional[str] = None
    engagement_score: float = 0.0
    workflow_status: str = "New"
    workflow_completed: bool = False
    completed_at: Optional[str] = None
    current_agent_node: Optional[str] = None
    thread_id: Optional[str] = None  # None until workflow starts
    last_activity: str = ""


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
    workflow_completed: bool = False
    completed_at: Optional[str] = None
    thread_id: Optional[str]
    emails_sent_count: int = 0
    # AI Insights from State
    intent_summary: Optional[str] = None
    urgency: Optional[str] = None
    product_interest: Optional[str] = None
    current_node: Optional[str] = None
    execution_log: list[ExecutionLogEntry] = []
    # Communication history
    communications: list[CommunicationEntry] = []
