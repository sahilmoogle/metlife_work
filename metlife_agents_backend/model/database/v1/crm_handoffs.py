"""
CRM handoff log  –  records successful A9 escalation to Salesforce / Jira.

Maps to Section 2 → ``crm_handoffs``.
"""

import uuid

from sqlalchemy import Column, Float, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class CRMHandoff(Base):
    __tablename__ = "crm_handoffs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)

    crm_ticket_id = Column(String(100), nullable=True, index=True)  # SF-99238, MET-4112
    crm_provider = Column(String(30), nullable=True)  # salesforce | jira

    # Snapshot at time of escalation
    handoff_score_snapshot = Column(Float, nullable=True)
    scenario_id = Column(String(5), nullable=True)
    briefing_summary = Column(Text, nullable=True)  # A9 LLM-generated sales briefing

    # Outcome tracking
    status = Column(
        String(30), default="escalated"
    )  # escalated | accepted | completed | declined
    advisor_assigned = Column(String(100), nullable=True)

    escalated_at = Column(TIMESTAMP, server_default=func.now())
    accepted_at = Column(TIMESTAMP, nullable=True)
    completed_at = Column(TIMESTAMP, nullable=True)
