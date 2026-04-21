"""add_sse_events_table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-21

Adds the ``sse_events`` table which persists every SSE event published
by the agent workflow so the frontend can replay missed events after a
browser refresh using the standard ``Last-Event-ID`` mechanism.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sse_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("lead_id", sa.String(100), nullable=True),
        sa.Column("thread_id", sa.String(100), nullable=True),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_sse_events_event_type", "sse_events", ["event_type"])
    op.create_index("ix_sse_events_lead_id", "sse_events", ["lead_id"])
    op.create_index("ix_sse_events_thread_id", "sse_events", ["thread_id"])
    op.create_index("ix_sse_events_created_at", "sse_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_sse_events_created_at", table_name="sse_events")
    op.drop_index("ix_sse_events_thread_id", table_name="sse_events")
    op.drop_index("ix_sse_events_lead_id", table_name="sse_events")
    op.drop_index("ix_sse_events_event_type", table_name="sse_events")
    op.drop_table("sse_events")
