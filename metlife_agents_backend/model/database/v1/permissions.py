import uuid
from sqlalchemy import Boolean, Column, String, TIMESTAMP
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from model.database.v1.base import Base, GUID


class Permission(Base):
    __tablename__ = "permissions"

    permission_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(TIMESTAMP, server_default=func.now())

    roles = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")