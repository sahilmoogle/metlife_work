"""
Email templates & email engagement events.

EmailTemplate  –  pre-approved brand asset library (Email #1 for all scenarios).
EmailEvent     –  individual engagement signals (sent/open/click) feeding A3 + A8.
"""

import uuid

from sqlalchemy import Boolean, Column, Float, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class EmailTemplate(Base):
    """Pre-approved email assets looked up by A5 for Email #1."""

    __tablename__ = "email_templates"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)

    scenario_id = Column(String(5), nullable=False, index=True)  # S1–S7
    persona_code = Column(String(20), nullable=True)  # F-1, E, F-2 …
    product_code = Column(String(50), nullable=True)  # PRODUCT_CODE filter

    template_name = Column(String(200), nullable=False)
    subject = Column(String(500), nullable=False)
    body_html = Column(Text, nullable=False)

    keigo_level = Column(String(20), nullable=True)  # casual / 丁寧語 / 敬語 / 最敬語
    language = Column(String(5), default="JA")  # JA | EN
    version = Column(Integer, default=1)

    is_active = Column(Boolean, default=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class EmailEvent(Base):
    """Individual engagement signals feeding A3 Intent Listener and A8 Scoring."""

    __tablename__ = "email_events"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)
    communication_id = Column(GUID(), nullable=True, index=True)

    event_type = Column(
        String(30), nullable=False, index=True
    )  # sent | delivered | opened | clicked | bounced | unsubscribed

    # Score contribution (written by A8)
    score_delta = Column(Float, nullable=True)  # +0.10 open, +0.15 click, etc.

    # Click details (used by A3 for CTA intent extraction)
    clicked_url = Column(String(500), nullable=True)
    clicked_label = Column(
        String(100), nullable=True
    )  # Medical Insurance / Life / Asset Formation

    # Metadata
    email_number = Column(Integer, nullable=True)  # 1–5 within sequence
    user_agent = Column(String(300), nullable=True)
    campaign_id = Column(String(100), nullable=True, index=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
