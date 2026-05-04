"""
LeadState — TypedDict for the LangGraph thread memory.

Every field here is checkpointed by PostgresSaver / SqliteSaver
so the workflow survives server restarts and browser refreshes.
"""

from __future__ import annotations

from typing import Annotated, Optional
import operator
import datetime

from langgraph.graph.message import add_messages


def create_log_entry(title: str, description: str, badges: list[str]) -> dict:
    """Append a UI log row. Timestamp is wall-clock so repeat runs differ in logs even when logic is deterministic."""
    return {
        "title": title,
        "description": description,
        "badges": badges,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


# ── State Definition ─────────────────────────────────────────────────
class LeadState(dict):
    """Central state container carried through every node in the graph.

    Uses ``dict`` subclass so LangGraph can serialise it for
    checkpoint persistence.  Annotated fields use LangGraph reducers
    where appropriate (e.g. ``add_messages`` for the message list).
    """

    # ── Identity ─────────────────────────────────────────────────────
    lead_id: str
    thread_id: str

    # ── Demographics (populated by A1) ───────────────────────────────
    first_name: Optional[str]
    last_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    age: Optional[int]
    gender: Optional[str]
    device_type: Optional[str]
    banner_code: Optional[str]
    product_code: Optional[str]
    registration_source: Optional[str]
    plan_code: Optional[str]
    accept_mail_error: Optional[str]
    session_id: Optional[str]  # upstream / analytics session (not LangGraph thread_id)

    # ── Survey answers ───────────────────────────────────────────────
    ans3: Optional[str]
    ans4: Optional[str]
    ans5: Optional[str]
    opt_in: bool

    # ── Scenario & Persona (set by A2) ───────────────────────────────
    scenario: Optional[str]  # S1–S7
    persona_code: Optional[str]  # F-1, E, F-2, etc.
    persona_confidence: float
    keigo_level: Optional[str]  # casual / 丁寧語 / 敬語 / 最敬語
    life_event_flag: bool
    active_buyer: bool

    # ── S4 Dormant Revival ───────────────────────────────────────────
    revival_segment: Optional[str]  # P1 / P2 / P3
    cooldown_flag: bool

    # ── S6/S7 Consultation ───────────────────────────────────────────
    email_captured: bool
    memo: Optional[str]  # T_CONSULT_REQ MEMO field
    consult_request_id: Optional[str]
    prefecture: Optional[str]
    zip_code: Optional[str]
    consult_campaign_code: Optional[str]  # CAMPAIGN_CODE on consultation form
    contract_status: Optional[str]
    latest_event_campaign_id: Optional[str]  # last Adobe/email_events campaign_id

    # ── Context block (assembled by A1) ──────────────────────────────
    context_block: Optional[str]

    # ── Intent (populated by A3) ─────────────────────────────────────
    intent_summary: Optional[str]
    urgency: Optional[str]
    product_interest: Optional[str]
    last_event_type: Optional[str]
    last_event_at: Optional[str]
    last_clicked_label: Optional[str]
    last_clicked_url: Optional[str]

    # ── Scoring (A8) ─────────────────────────────────────────────────
    base_score: float
    engagement_score: float
    handoff_threshold: float

    # ── Email content (A4/A5) ────────────────────────────────────────
    draft_email_subject: Optional[str]  # Japanese subject (sent to lead)
    draft_email_subject_en: Optional[str]  # English label for operator dashboard
    draft_email_body: Optional[str]
    content_type: Optional[str]  # existing_asset | llm_generated
    template_name: Optional[str]  # Seed template key
    email_number: int
    max_emails: int

    # ── HITL control ─────────────────────────────────────────────────
    hitl_status: Optional[str]  # idle | pending | approved | edited | rejected
    hitl_gate: Optional[str]  # G1–G5
    hitl_reviewer_notes: Optional[str]
    hitl_resume_value: Optional[
        str
    ]  # Last human decision: approved | edited | rejected | hold

    # ── Workflow state ───────────────────────────────────────────────
    workflow_status: str  # active | paused | completed | failed | suppressed
    current_node: Optional[str]
    is_converted: bool
    post_send_route: bool
    regenerate_current_email: bool

    # ── Language ─────────────────────────────────────────────────────
    target_language: str  # EN | JA

    # ── Handoff (A9) ────────────────────────────────────────────────
    handoff_briefing: Optional[str]

    # ── Messages (LangGraph reducer) ─────────────────────────────────
    messages: Annotated[list, add_messages]

    # ── Execution History (Audit Trail) ──────────────────────────────
    execution_log: Annotated[list, operator.add]


# ── Factory ──────────────────────────────────────────────────────────
def create_initial_state(
    lead_id: str,
    thread_id: str,
    target_language: str = "JA",
) -> dict:
    """Return a valid initial state dict for a new LangGraph thread."""
    return {
        "lead_id": lead_id,
        "thread_id": thread_id,
        # Demographics — filled by A1
        "first_name": None,
        "last_name": None,
        "email": None,
        "phone": None,
        "age": None,
        "gender": None,
        "device_type": None,
        "banner_code": None,
        "product_code": None,
        "registration_source": None,
        "plan_code": None,
        "accept_mail_error": None,
        "session_id": None,
        # Survey
        "ans3": None,
        "ans4": None,
        "ans5": None,
        "opt_in": False,
        # Scenario
        "scenario": None,
        "persona_code": None,
        "persona_confidence": 0.0,
        "keigo_level": None,
        "life_event_flag": False,
        "active_buyer": False,
        # S4
        "revival_segment": None,
        "cooldown_flag": False,
        # S6/S7
        "email_captured": False,
        "memo": None,
        "consult_request_id": None,
        "prefecture": None,
        "zip_code": None,
        "consult_campaign_code": None,
        "contract_status": None,
        "consult_request_type": None,
        "latest_event_campaign_id": None,
        # Context
        "context_block": None,
        # Intent
        "intent_summary": None,
        "urgency": None,
        "product_interest": None,
        "last_event_type": None,
        "last_event_at": None,
        "last_clicked_label": None,
        "last_clicked_url": None,
        # Score
        "base_score": 0.0,
        "engagement_score": 0.0,
        "handoff_threshold": 0.80,
        # Email
        "draft_email_subject": None,
        "draft_email_subject_en": None,
        "draft_email_body": None,
        "content_type": None,
        "template_name": None,
        "email_number": 0,
        "max_emails": 5,
        # HITL
        "hitl_status": "idle",
        "hitl_gate": None,
        "hitl_reviewer_notes": None,
        "hitl_resume_value": None,
        # Workflow
        "workflow_status": "active",
        "current_node": None,
        "is_converted": False,
        "post_send_route": False,
        "regenerate_current_email": False,
        # Language
        "target_language": target_language,
        # Handoff
        "handoff_briefing": None,
        # Execution History
        "execution_log": [],
        # Messages
        "messages": [],
    }
