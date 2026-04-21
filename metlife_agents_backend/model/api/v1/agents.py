"""
Pydantic request/response models for the Agent workflow APIs.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class StartWorkflowRequest(BaseModel):
    lead_id: str
    target_language: str = "JA"


class StartWorkflowResponse(BaseModel):
    thread_id: str
    lead_id: str
    scenario: Optional[str] = None
    current_node: Optional[str] = None
    engagement_score: float = 0.0
    workflow_status: str = "active"
    hitl_gate: Optional[str] = None


class ResumeWorkflowRequest(BaseModel):
    thread_id: str
    resume_value: str = "approved"


class HITLApproveRequest(BaseModel):
    thread_id: str
    action: str = "approved"  # approved | edited | rejected
    edited_subject: Optional[str] = None
    edited_body: Optional[str] = None
    reviewer_notes: Optional[str] = None
    persona_override: Optional[str] = None  # G2 only


class HITLQueueItem(BaseModel):
    id: str
    lead_id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    scenario_id: Optional[str] = None
    engagement_score: Optional[float] = None
    thread_id: str
    gate_type: str
    gate_description: Optional[str] = None
    draft_subject: Optional[str] = None
    draft_body: Optional[str] = None
    handoff_briefing: Optional[str] = None
    suggested_persona: Optional[str] = None
    persona_confidence: Optional[float] = None
    review_status: str
    reviewer_notes: Optional[str] = None
    created_at: Optional[str] = None


class EventTrackRequest(BaseModel):
    thread_id: str
    event_type: str  # e.g., 'email_opened', 'email_clicked'


class ExecutionLogEntry(BaseModel):
    title: str
    description: str
    badges: list[str]
    timestamp: str


class WorkflowHistoryResponse(BaseModel):
    thread_id: str
    execution_log: list[ExecutionLogEntry]
