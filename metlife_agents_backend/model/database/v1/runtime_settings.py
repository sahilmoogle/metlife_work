"""
Global runtime settings  –  hot-swappable flags that affect system behaviour
without a code deployment.

Currently used for:
  • workflow_intake_mode  –  "automatic" | "manual"
    Automatic: every new lead from an intake endpoint immediately triggers
    the full agent workflow.
    Manual: leads are persisted but the workflow must be started explicitly
    via POST /agents/start.
"""

import uuid

from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base


class RuntimeSettings(Base):
    __tablename__ = "runtime_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key = Column(String(64), nullable=False, unique=True)
    value = Column(String(512), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # ── known keys ──────────────────────────────────────────────────────────
    WORKFLOW_INTAKE_MODE = "workflow_intake_mode"
    MODE_AUTOMATIC = "automatic"
    MODE_MANUAL = "manual"
