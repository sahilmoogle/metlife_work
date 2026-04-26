"""
Internal email outbox for no-external-service mode.

Rows here represent the email provider boundary that would normally be handled
by Adobe Campaign or an SMTP service.  The backend can keep sends pending,
held for quiet hours, or mark them sent without relying on an external system.
"""

import uuid

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class EmailOutbox(Base):
    __tablename__ = "email_outbox"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)
    thread_id = Column(String(100), nullable=True, index=True)

    subject = Column(String(500), nullable=True)
    subject_en = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    template_name = Column(String(200), nullable=True)
    email_number = Column(Integer, nullable=True)
    content_type = Column(String(30), nullable=True)

    status = Column(
        String(20), default="pending", index=True
    )  # pending | held | sent | cancelled
    hold_reason = Column(String(200), nullable=True)
    scheduled_for = Column(TIMESTAMP, nullable=True, index=True)
    sent_at = Column(TIMESTAMP, nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
