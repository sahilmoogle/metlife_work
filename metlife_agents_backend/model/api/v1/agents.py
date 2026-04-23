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
    action: str = "approved"  # approved | edited | rejected | hold
    edited_subject: Optional[str] = None
    edited_body: Optional[str] = None
    reviewer_notes: Optional[str] = None
    persona_override: Optional[str] = None  # G2 only: override the AI persona


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
    edited_subject: Optional[str] = None
    edited_body: Optional[str] = None
    handoff_briefing: Optional[str] = None
    suggested_persona: Optional[str] = None
    persona_confidence: Optional[float] = None
    review_status: str
    reviewer_notes: Optional[str] = None
    created_at: Optional[str] = None


class EventTrackRequest(BaseModel):
    thread_id: str
    event_type: str  # email_opened | email_clicked | unsubscribe | bounce |
    # consult_page_visit | seminar_inquiry | f2f_request | direct_reply

    # Click-specific fields (populated when event_type == 'email_clicked')
    clicked_url: Optional[str] = None  # Full URL of the CTA that was clicked
    clicked_label: Optional[str] = (
        None  # Human-readable label: "Medical Insurance" etc.
    )


class ExecutionLogEntry(BaseModel):
    title: str
    description: str
    badges: list[str]
    timestamp: str


class WorkflowHistoryResponse(BaseModel):
    thread_id: str
    execution_log: list[ExecutionLogEntry]


class BatchRunResponse(BaseModel):
    """Progress snapshot for a single batch run (one click of the Run button)."""

    batch_id: str
    status: str  # running | completed | partial_failure | failed

    total: int = 0
    total_new: int = 0
    total_dormant: int = 0

    processed_count: int = 0
    success_count: int = 0
    failed_count: int = 0

    failed_lead_ids: list[str] = []
    error_summary: dict = {}

    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    pct: int = 0  # 0–100 progress percentage


class WorkflowStateResponse(BaseModel):
    """Full LangGraph checkpoint state — used by the state inspector endpoint."""

    thread_id: str
    lead_id: Optional[str] = None
    scenario: Optional[str] = None
    persona_code: Optional[str] = None
    persona_confidence: Optional[float] = None
    keigo_level: Optional[str] = None
    engagement_score: float = 0.0
    base_score: float = 0.0
    handoff_threshold: float = 0.80
    email_number: int = 0
    max_emails: int = 5
    content_type: Optional[str] = None
    draft_email_subject: Optional[str] = None
    intent_summary: Optional[str] = None
    urgency: Optional[str] = None
    product_interest: Optional[str] = None
    hitl_gate: Optional[str] = None
    hitl_status: Optional[str] = None
    hitl_resume_value: Optional[str] = None
    workflow_status: Optional[str] = None
    current_node: Optional[str] = None
    revival_segment: Optional[str] = None
    is_converted: bool = False
    target_language: str = "JA"
    execution_log: list[ExecutionLogEntry] = []
