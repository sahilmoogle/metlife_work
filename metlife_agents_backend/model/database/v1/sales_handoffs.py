"""
Internal sales handoff queue.

This replaces the Salesforce/Jira boundary for local and no-external-service
operation.  G4 approval creates one row so sales acceptance is durable and
auditable instead of living only as a lead status change.
"""

import uuid

from sqlalchemy import Column, Float, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class SalesHandoff(Base):
    __tablename__ = "sales_handoffs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)
    thread_id = Column(String(100), nullable=False, index=True)

    scenario_id = Column(String(5), nullable=True, index=True)
    score_snapshot = Column(Float, nullable=True)
    briefing = Column(Text, nullable=True)
    source_gate = Column(String(10), default="G4")

    status = Column(
        String(30), default="accepted", index=True
    )  # accepted | assigned | completed | cancelled
    assigned_to = Column(String(100), nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    accepted_at = Column(TIMESTAMP, server_default=func.now())
    completed_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
