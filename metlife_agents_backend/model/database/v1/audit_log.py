"""
Audit log  –  compliance-grade record of all administrative actions.

Visible in the Admin · RBAC screen of the UI.
"""

import uuid

from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), nullable=True, index=True)

    action = Column(
        String(100), nullable=False, index=True
    )  # login | hitl_approve | batch_run | config_update
    resource_type = Column(
        String(50), nullable=True
    )  # lead | hitl | batch | user | scenario
    resource_id = Column(String(100), nullable=True)

    details = Column(Text, nullable=True)  # JSON-serialized delta or description
    ip_address = Column(String(50), nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
