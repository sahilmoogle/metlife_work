"""
Lead model  –  core demographic profile for every lead in the system.

Sourced from T_YEC_QUOTE_MST webhook or T_CONSULT_REQ form submissions.
Maps to Section 2 → ``leads`` table and the UI lead detail panel.
"""

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    Index,
    Integer,
    String,
    TIMESTAMP,
)
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class Lead(Base):
    __tablename__ = "leads"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)

    # ── Oracle T_YEC_QUOTE_MST identifiers ──────────────────────────
    quote_id = Column(String(100), unique=True, nullable=True, index=True)

    # ── Demographics ────────────────────────────────────────────────
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String(10), nullable=True)  # M / F / 0 / 1
    date_of_birth = Column(String(20), nullable=True)  # from POWN_DOB

    # ── Survey routing fields (ANS3/ANS4/ANS5) from flows ──────────
    ans3 = Column(String(5), nullable=True)  # A / B / C
    ans4 = Column(String(5), nullable=True)  # Yes / No  (life event)
    ans5 = Column(String(5), nullable=True)  # Yes / No

    # ── Source / device context ─────────────────────────────────────
    device_type = Column(String(50), nullable=True)  # MOBILE_SITE / PC
    banner_code = Column(String(100), nullable=True)  # Campaign source
    product_code = Column(String(50), nullable=True)  # PRODUCT_CODE
    plan_code = Column(String(50), nullable=True)  # PLAN_CODE (T_YEC_QUOTE_MST)
    registration_source = Column(
        String(50), nullable=True
    )  # newsletter / f2f_form / web_callback
    opt_in = Column(
        Boolean, default=False
    )  # OPT_IN flag  (True = opted out → suppress)
    accept_mail_error = Column(String(255), nullable=True)  # ACCEPT_MAIL_ERROR (feed)
    session_id = Column(
        String(200), nullable=True, index=True
    )  # upstream session / analytics id (not LangGraph thread_id)

    # ── Scenario & persona assignment (set by Agent A2) ─────────────
    scenario_id = Column(String(5), nullable=True, index=True)  # S1–S7
    persona_code = Column(String(20), nullable=True)  # F-1, E, F-2, etc.
    persona_confidence = Column(Float, nullable=True)  # 0.0 – 1.0
    keigo_level = Column(String(20), nullable=True)  # casual / 丁寧語 / 敬語 / 最敬語

    # ── Scoring (maintained by Agent A8) ────────────────────────────
    engagement_score = Column(Float, default=0.0)  # Propensity score
    base_score = Column(Float, default=0.0)  # Initial base for the scenario

    # ── Workflow status ─────────────────────────────────────────────
    workflow_status = Column(
        String(30), default="New", index=True
    )  # New | Active | Pending_HITL | Converted | Dormant | Suppressed

    current_agent_node = Column(String(30), nullable=True)  # e.g. A4_Content
    emails_sent_count = Column(Integer, default=0)
    max_emails = Column(Integer, default=5)

    # ── S4 Dormant Revival specifics ────────────────────────────────
    revival_segment = Column(String(5), nullable=True)  # P1 / P2 / P3
    cooldown_flag = Column(Boolean, default=False)
    is_converted = Column(Boolean, default=False)

    # ── Completion bookkeeping ───────────────────────────────────────
    # Used by UI to show per-lead completion regardless of status label.
    workflow_completed = Column(Boolean, default=False, index=True)
    completed_at = Column(TIMESTAMP, nullable=True)

    # ── LangGraph thread linkage ────────────────────────────────────
    thread_id = Column(
        String(100), nullable=True, index=True
    )  # UUID linking to LangGraph checkpointer

    # ── Timestamps ──────────────────────────────────────────────────
    commit_time = Column(TIMESTAMP, nullable=True)  # Original Oracle COMMIT_TIME
    # Updated on every lead-initiated engagement (open/click/consult/etc.).
    # Used by dormancy scan: if last_active_at < NOW-180d → eligible for S4.
    last_active_at = Column(TIMESTAMP, nullable=True, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_lead_scenario", "scenario_id"),
        Index("idx_lead_status", "workflow_status"),
        Index("idx_lead_thread", "thread_id"),
    )
