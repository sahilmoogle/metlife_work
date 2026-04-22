import uuid

from sqlalchemy import Boolean, Column, ForeignKey, String, TIMESTAMP, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class Role(Base):
    __tablename__ = "roles"

    role_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(TIMESTAMP, server_default=func.now())

    users = relationship("User", back_populates="role")
    permissions = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    role_id = Column(
        GUID(),
        ForeignKey("roles.role_id", ondelete="CASCADE"),
        nullable=False,
    )
    permission_id = Column(
        GUID(),
        ForeignKey("permissions.permission_id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = Column(TIMESTAMP, server_default=func.now())

    role = relationship("Role", back_populates="permissions")
    permission = relationship("Permission", back_populates="roles")