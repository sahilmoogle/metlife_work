"""
External communications  –  outbound email tracking via SendGrid / Adobe Campaign.

Maps to Section 2 → ``communications`` and the UI comm history panel.
"""

import uuid

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class Communication(Base):
    __tablename__ = "communications"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)

    # SMTP / Campaign provider reference
    external_message_id = Column(String(200), nullable=True, index=True)
    channel = Column(String(30), default="email")  # email | sms | push

    # Content
    subject = Column(String(500), nullable=True)
    body_preview = Column(Text, nullable=True)
    email_number = Column(Integer, nullable=True)  # 1–5 within the sequence
    content_type = Column(String(30), nullable=True)  # existing_asset | llm_generated

    # Engagement tracking
    sent_at = Column(TIMESTAMP, nullable=True)
    delivered_at = Column(TIMESTAMP, nullable=True)
    opened_at = Column(TIMESTAMP, nullable=True)
    clicked_at = Column(TIMESTAMP, nullable=True)
    bounced_at = Column(TIMESTAMP, nullable=True)
    unsubscribed_at = Column(TIMESTAMP, nullable=True)

    # Link to the CTA clicked (used by A3 Intent Listener)
    clicked_cta_url = Column(String(500), nullable=True)
    clicked_cta_label = Column(
        String(100), nullable=True
    )  # Medical Insurance / Life / Asset Formation

    created_at = Column(TIMESTAMP, server_default=func.now())
