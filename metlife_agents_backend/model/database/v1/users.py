"""
User model  –  MetLife operational staff (RBAC-enabled).

Roles: Admin, Manager, Reviewer, Viewer
Maps to Section 2 → ``users`` table in the development plan.
"""

import uuid

from sqlalchemy import Boolean, Column, Index, String, TIMESTAMP, Text
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class User(Base):
    __tablename__ = "users"

    user_id = Column(GUID(), primary_key=True, default=uuid.uuid4)

    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)

    password_hash = Column(String(255), nullable=False)

    # Enforces RBAC  –  Admin | Manager | Reviewer | Viewer
    role = Column(String(50), nullable=False, default="Viewer")

    is_active = Column(Boolean, server_default="1", default=True)
    is_verified = Column(Boolean, server_default="0", default=False)

    # Per-user permission overrides (JSON stored as Text).
    # Stored as a JSON string: {"export_data": true, "hitl_approve": false}
    # Keys present here override the role-default for that specific user.
    # Keys absent fall back to ROLE_PERMISSIONS[role].
    # NULL means no overrides — pure role-based permissions apply.
    custom_permissions = Column(Text, nullable=True, default=None)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("idx_user_email", "email"),)
