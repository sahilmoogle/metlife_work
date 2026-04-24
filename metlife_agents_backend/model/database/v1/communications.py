"""
Outbound email tracking  –  records every email dispatched to a lead.

Maps to Section 2 → ``communications`` and the UI comm history panel.
Engagement events (open / click / bounce / unsubscribe) are written here
directly by the internal events/track API — no external provider required.
"""

import uuid

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class Communication(Base):
    __tablename__ = "communications"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)

    # Internal message reference (assigned by send_engine, used for deduplication)
    internal_message_ref = Column(String(200), nullable=True, index=True)
    channel = Column(String(30), default="email")  # matches DB / Alembic

    # Content
    subject = Column(String(500), nullable=True)  # Japanese subject (sent to lead)
    subject_en = Column(
        String(500), nullable=True
    )  # English label for operator dashboard
    template_name = Column(
        String(200), nullable=True
    )  # Seed template key (e.g. s4_revival_p1_brand_campaign)
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
    campaign_id = Column(String(100), nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
