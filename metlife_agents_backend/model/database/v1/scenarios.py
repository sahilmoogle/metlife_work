"""
Dynamic scenario configuration  –  hot-swappable thresholds.

Allows admins to adjust handoff thresholds, cadence, and activation
without code deployment.  Maps to Section 2 → ``scenarios_config``.
"""

from sqlalchemy import Boolean, Column, Float, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base


class ScenarioConfig(Base):
    __tablename__ = "scenarios_config"

    scenario_id = Column(String(5), primary_key=True)  # S1, S2, … S7
    name = Column(String(100), nullable=False)  # "Young Professional"
    description = Column(Text, nullable=True)

    handoff_threshold = Column(Float, nullable=False, default=0.80)
    base_score = Column(Float, nullable=False, default=0.40)
    cadence_days = Column(Integer, nullable=False, default=3)
    max_emails = Column(Integer, nullable=False, default=5)

    # Keigo / tone defaults for this scenario
    default_keigo = Column(String(20), nullable=True)  # casual / 丁寧語 / 敬語 / 最敬語
    default_tone = Column(String(50), nullable=True)  # casual / empathetic / formal

    is_active = Column(Boolean, default=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
