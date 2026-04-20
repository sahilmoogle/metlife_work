"""
Consultation requests  –  T_CONSULT_REQ form submissions (S6 / S7).

Captures F2F consultation and web-to-call requests that enter
through forms W011 / W022 / W033 — a different schema than T_YEC_QUOTE_MST.
Maps to the PAN flow HTML → S6 + S7 triggers.
"""

import uuid

from sqlalchemy import Boolean, Column, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class ConsultationRequest(Base):
    __tablename__ = "consultation_requests"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(
        GUID(), nullable=True, index=True
    )  # linked after A1 profile assembly

    # Form identification
    form_id = Column(String(20), nullable=True)  # W011 / W022 / W033
    request_type = Column(
        String(30), nullable=False
    )  # face_to_face | web_to_call | seminar

    # Demographics from the consultation form (differs from T_YEC_QUOTE_MST)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    gender = Column(String(5), nullable=True)  # M / F (not 0/1)
    date_of_birth = Column(String(20), nullable=True)

    # Free-text memo field  (up to 4000 chars per spec)
    memo = Column(Text, nullable=True)

    # Flags
    face_to_face = Column(Boolean, default=False)
    email_captured = Column(Boolean, default=False)

    # Processing state
    status = Column(String(30), default="new")  # new | assigned | scheduled | completed
    assigned_advisor = Column(String(100), nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    scheduled_at = Column(TIMESTAMP, nullable=True)
    completed_at = Column(TIMESTAMP, nullable=True)
