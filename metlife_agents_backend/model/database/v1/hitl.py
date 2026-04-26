"""
HITL queue  –  frozen payloads awaiting human review.

Stores drafted content from A4/A5 that requires compliance officer
approval before A6 can send.  Covers all five gate types (G1–G5).
Maps to Section 2 → ``hitl_queue`` and the UI HITL review screen.
"""

import uuid

from sqlalchemy import Column, Float, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class HITLQueue(Base):
    __tablename__ = "hitl_queue"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)

    # When the workflow was started from ``POST /agents/batch/run`` — enables batch-scoped HITL counts.
    batch_id = Column(GUID(), nullable=True, index=True)

    # LangGraph checkpointer thread for resume
    thread_id = Column(String(100), nullable=False, index=True)

    # Gate identification  –  G1 Content | G2 Persona | G3 Campaign | G4 Sales | G5 Score
    gate_type = Column(String(10), nullable=False, index=True)
    gate_description = Column(String(200), nullable=True)

    # Drafted content (populated for G1 Content Compliance gate)
    draft_subject = Column(String(500), nullable=True)
    draft_body = Column(Text, nullable=True)
    content_type = Column(String(30), nullable=True)  # existing_asset | llm_generated
    email_number = Column(String(10), nullable=True)  # Email #1, #2 … #5

    # Handoff briefing (populated for G4 Sales Handoff gate)
    handoff_briefing = Column(Text, nullable=True)
    handoff_score_snapshot = Column(Float, nullable=True)

    # Persona override data (populated for G2 Persona Override gate)
    suggested_persona = Column(String(20), nullable=True)
    persona_confidence = Column(Float, nullable=True)

    # Campaign data (populated for G3 Campaign Approval gate)
    campaign_batch_size = Column(String(50), nullable=True)

    # Review state
    review_status = Column(
        String(20), default="Awaiting", index=True
    )  # Awaiting | Approved | Edited | Rejected | Hold
    reviewed_by_user_id = Column(GUID(), nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    # Edited content (if reviewer modified the draft)
    edited_subject = Column(String(500), nullable=True)
    edited_body = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    reviewed_at = Column(TIMESTAMP, nullable=True)
