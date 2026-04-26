"""
Internal workflow timers for cadence, quiet hours, and response windows.

These rows are deliberately simple.  They give the backend a durable place to
record when a workflow should be resumed without requiring Adobe Campaign,
Celery, or another scheduler during local/demo operation.
"""

import uuid

from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class WorkflowTimer(Base):
    __tablename__ = "workflow_timers"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=True, index=True)
    thread_id = Column(String(100), nullable=False, index=True)

    timer_type = Column(
        String(50), nullable=False, index=True
    )  # quiet_hours | cadence | s4_response_window
    status = Column(String(20), default="pending", index=True)
    due_at = Column(TIMESTAMP, nullable=False, index=True)
    payload = Column(String(1000), nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
