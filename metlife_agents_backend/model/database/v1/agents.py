"""
LangGraph agent state persistence models.

AgentRun        –  tracks each LangGraph graph invocation per lead.
AgentCheckpoint –  mirrors the LangGraph PostgresSaver checkpoint structure
                   for visibility (actual checkpoints are managed by LangGraph).
AgentMemory     –  stores extracted context carried between agent nodes.
"""

import uuid

from sqlalchemy import Column, Float, Integer, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from model.database.v1.base import Base, GUID


class AgentRun(Base):
    """One record per LangGraph graph invocation for a lead."""

    __tablename__ = "agent_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)
    batch_run_id = Column(GUID(), nullable=True, index=True)

    thread_id = Column(String(100), nullable=False, index=True)  # LangGraph thread UUID
    scenario_id = Column(String(5), nullable=True)

    status = Column(
        String(20), default="running", index=True
    )  # running | paused | completed | failed

    # Progress through the node pipeline
    current_node = Column(String(30), nullable=True)  # A1, A2, … A10
    nodes_completed = Column(
        Text, nullable=True
    )  # comma-separated list of completed nodes

    # Timing
    started_at = Column(TIMESTAMP, server_default=func.now())
    paused_at = Column(TIMESTAMP, nullable=True)
    completed_at = Column(TIMESTAMP, nullable=True)
    total_latency_ms = Column(Integer, nullable=True)


class AgentCheckpoint(Base):
    """
    Visibility mirror of LangGraph's native checkpoint table.

    The actual checkpoint data is managed by LangGraph's PostgresSaver /
    SqliteSaver.  This table stores a lightweight reference for the HITL
    queue and admin dashboard.
    """

    __tablename__ = "agent_checkpoints"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    thread_id = Column(String(100), nullable=False, index=True)
    checkpoint_ns = Column(String(200), nullable=True)
    checkpoint_id = Column(String(100), nullable=True)
    parent_checkpoint_id = Column(String(100), nullable=True)

    node_name = Column(String(30), nullable=True)  # Node that triggered the checkpoint
    state_summary = Column(Text, nullable=True)  # Human-readable state summary

    created_at = Column(TIMESTAMP, server_default=func.now())


class AgentMemory(Base):
    """
    Extracted context carried between agent nodes within a single run.

    A3 → intent signals, A8 → score components, A4 → theme selection.
    """

    __tablename__ = "agent_memory"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    lead_id = Column(GUID(), nullable=False, index=True)
    agent_run_id = Column(GUID(), nullable=True, index=True)

    memory_key = Column(
        String(100), nullable=False, index=True
    )  # intent | urgency | theme | score_delta
    memory_value = Column(Text, nullable=True)
    numeric_value = Column(Float, nullable=True)

    agent_source = Column(String(30), nullable=True)  # Which agent wrote this memory
    version = Column(Integer, default=1)

    created_at = Column(TIMESTAMP, server_default=func.now())
