"""drop_unused_tables

Remove tables that were never written to by the application:
  - agent_checkpoints  (LangGraph manages its own checkpoint tables)
  - agent_memory       (cross-node context lives in LangGraph state)
  - agent_runs         (per-invocation tracking — duplicates leads.current_agent_node)
  - agent_logs         (per-node execution logs — no UI screen consumes them)
  - batch_runs         (batch job metadata — no UI screen consumes it)
  - crm_handoffs       (no CRM integration; handoff data lives in hitl_queue)

All live data for the Figma screens is served by:
  leads, hitl_queue, communications, email_events, consultation_requests,
  scenarios_config, quotes, audit_logs, users, blacklisted_tokens.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-21 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = [
    "agent_checkpoints",
    "agent_memory",
    "agent_runs",
    "agent_logs",
    "batch_runs",
    "crm_handoffs",
]


def upgrade() -> None:
    for table in _TABLES:
        op.drop_table(table)


def downgrade() -> None:
    op.create_table(
        "crm_handoffs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("crm_ticket_id", sa.String(length=100), nullable=True),
        sa.Column("crm_provider", sa.String(length=30), nullable=True),
        sa.Column("handoff_score_snapshot", sa.Float(), nullable=True),
        sa.Column("scenario_id", sa.String(length=5), nullable=True),
        sa.Column("briefing_summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=True),
        sa.Column("advisor_assigned", sa.String(length=100), nullable=True),
        sa.Column(
            "escalated_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column("accepted_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "batch_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("started_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("total_leads_targeted", sa.Integer(), nullable=True),
        sa.Column("leads_processed", sa.Integer(), nullable=True),
        sa.Column("leads_completed", sa.Integer(), nullable=True),
        sa.Column("leads_hitl_paused", sa.Integer(), nullable=True),
        sa.Column("leads_failed", sa.Integer(), nullable=True),
        sa.Column("s1_count", sa.Integer(), nullable=True),
        sa.Column("s2_count", sa.Integer(), nullable=True),
        sa.Column("s3_count", sa.Integer(), nullable=True),
        sa.Column("s4_count", sa.Integer(), nullable=True),
        sa.Column("s5_count", sa.Integer(), nullable=True),
        sa.Column("s6_count", sa.Integer(), nullable=True),
        sa.Column("s7_count", sa.Integer(), nullable=True),
        sa.Column(
            "started_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column("finished_at", sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "agent_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("batch_run_id", sa.String(length=36), nullable=True),
        sa.Column("agent_node", sa.String(length=30), nullable=False),
        sa.Column("action_summary", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("llm_model", sa.String(length=50), nullable=True),
        sa.Column("llm_tokens_used", sa.Integer(), nullable=True),
        sa.Column("llm_cost_jpy", sa.Float(), nullable=True),
        sa.Column("input_snapshot", sa.Text(), nullable=True),
        sa.Column("output_snapshot", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("batch_run_id", sa.String(length=36), nullable=True),
        sa.Column("thread_id", sa.String(length=100), nullable=False),
        sa.Column("scenario_id", sa.String(length=5), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("current_node", sa.String(length=30), nullable=True),
        sa.Column("nodes_completed", sa.Text(), nullable=True),
        sa.Column(
            "started_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column("paused_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("total_latency_ms", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "agent_memory",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("agent_run_id", sa.String(length=36), nullable=True),
        sa.Column("memory_key", sa.String(length=100), nullable=False),
        sa.Column("memory_value", sa.Text(), nullable=True),
        sa.Column("numeric_value", sa.Float(), nullable=True),
        sa.Column("agent_source", sa.String(length=30), nullable=True),
        sa.Column("version", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "agent_checkpoints",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("thread_id", sa.String(length=100), nullable=False),
        sa.Column("checkpoint_ns", sa.String(length=200), nullable=True),
        sa.Column("checkpoint_id", sa.String(length=100), nullable=True),
        sa.Column("parent_checkpoint_id", sa.String(length=100), nullable=True),
        sa.Column("node_name", sa.String(length=30), nullable=True),
        sa.Column("state_summary", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
