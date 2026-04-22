"""
Token blacklist  –  revoked JWTs stored for logout enforcement.
"""

import uuid

from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class BlacklistedToken(Base):
    __tablename__ = "blacklisted_tokens"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    token = Column(String(512), unique=True, nullable=False, index=True)
    blacklisted_at = Column(TIMESTAMP, server_default=func.now())
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
