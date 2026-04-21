"""
Batch run tracker — one row per click of the 'Run' button.

Records the full lifecycle of a batch: how many leads were queued,
how many succeeded, which ones failed, and when it finished.
Used by GET /agents/batch/status so the UI can show a live
progress bar and a post-run summary without polling every lead.
"""

import uuid

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class BatchRun(Base):
    __tablename__ = "batch_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)

    # ── Counts set at creation ───────────────────────────────────────
    total_new = Column(Integer, default=0)  # New leads queued
    total_dormant = Column(Integer, default=0)  # Dormant leads queued
    total = Column(Integer, default=0)  # total_new + total_dormant

    # ── Live progress counters (updated as each lead finishes) ───────
    processed_count = Column(Integer, default=0)  # succeeded + failed so far
    success_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)

    # ── Failure detail ───────────────────────────────────────────────
    # JSON list of lead UUIDs that errored: ["uuid1", "uuid2", ...]
    failed_lead_ids = Column(Text, nullable=True)
    # JSON dict of {lead_id: "error message"} for debugging
    error_summary = Column(Text, nullable=True)

    # ── Lifecycle ────────────────────────────────────────────────────
    status = Column(
        String(20), default="running", index=True
    )  # running | completed | partial_failure | failed

    started_at = Column(TIMESTAMP, server_default=func.now())
    completed_at = Column(TIMESTAMP, nullable=True)
