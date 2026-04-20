"""
Agent execution log  –  immutable paper trail of all agentic interventions.

Every time an agent node fires (A1–A10), a record is created here
for compliance analytics and the dashboard latency metrics.
Maps to Section 2 → ``agent_logs``.
"""

import uuid

from sqlalchemy import Column, Float, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)
    batch_run_id = Column(GUID(), nullable=True, index=True)

    agent_node = Column(
        String(30), nullable=False, index=True
    )  # A1_Identity, A2_Persona, A3_Intent, …
    action_summary = Column(Text, nullable=True)  # Plain language record

    # Performance tracking for dashboard
    latency_ms = Column(Integer, nullable=True)

    # LLM specifics (when applicable)
    llm_model = Column(String(50), nullable=True)  # gpt-4, gpt-4o-mini
    llm_tokens_used = Column(Integer, nullable=True)
    llm_cost_jpy = Column(Float, nullable=True)

    # Input / output snapshot for debugging
    input_snapshot = Column(Text, nullable=True)
    output_snapshot = Column(Text, nullable=True)

    status = Column(String(20), default="completed")  # completed | failed | skipped

    created_at = Column(TIMESTAMP, server_default=func.now())
