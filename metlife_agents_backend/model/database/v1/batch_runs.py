"""
Batch run orchestration  –  tracks macro "Run All Workflows" jobs.

Triggered from the Workflow Orchestration UI screen via
POST /api/v1/workflows/batch/run.
Maps to Section 2 → ``batch_runs``.
"""

import uuid

from sqlalchemy import Column, Integer, String, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class BatchRun(Base):
    __tablename__ = "batch_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    started_by_user_id = Column(GUID(), nullable=False, index=True)

    status = Column(
        String(20), default="Processing", index=True
    )  # Processing | Paused | Completed | Failed

    total_leads_targeted = Column(Integer, default=0)
    leads_processed = Column(Integer, default=0)
    leads_completed = Column(Integer, default=0)
    leads_hitl_paused = Column(Integer, default=0)
    leads_failed = Column(Integer, default=0)

    # Scenario breakdown (populated as A2 classifies)
    s1_count = Column(Integer, default=0)
    s2_count = Column(Integer, default=0)
    s3_count = Column(Integer, default=0)
    s4_count = Column(Integer, default=0)
    s5_count = Column(Integer, default=0)
    s6_count = Column(Integer, default=0)
    s7_count = Column(Integer, default=0)

    started_at = Column(TIMESTAMP, server_default=func.now())
    finished_at = Column(TIMESTAMP, nullable=True)
