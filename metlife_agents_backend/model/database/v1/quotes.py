"""
Master quotes  –  historical snapshot of T_YEC_QUOTE_MST webhook data.

Maps to Section 2 → ``quotes`` table in the development plan.
"""

import uuid

from sqlalchemy import Column, Integer, String, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class Quote(Base):
    __tablename__ = "quotes"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)

    product_category = Column(String(100), nullable=True)  # Term Life, Medical, etc.
    product_code = Column(String(50), nullable=True)  # PRODUCT_CODE from Oracle
    premium_estimate_jpy = Column(Integer, nullable=True)

    # Raw Oracle fields preserved as-is for audit
    raw_quote_ref = Column(String(200), nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
