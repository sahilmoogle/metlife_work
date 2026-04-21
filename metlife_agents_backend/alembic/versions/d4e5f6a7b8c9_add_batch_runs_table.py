"""add_batch_runs_table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-21

Adds the ``batch_runs`` table which tracks every invocation of the
Work Flow Engine 'Run' button: total leads, per-lead success/failure
counts, and failed lead IDs so the UI can show a live progress bar
and a post-run failure summary.
"""

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "batch_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("total_new", sa.Integer(), default=0),
        sa.Column("total_dormant", sa.Integer(), default=0),
        sa.Column("total", sa.Integer(), default=0),
        sa.Column("processed_count", sa.Integer(), default=0),
        sa.Column("success_count", sa.Integer(), default=0),
        sa.Column("failed_count", sa.Integer(), default=0),
        sa.Column("failed_lead_ids", sa.Text(), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), default="running"),
        sa.Column(
            "started_at",
            sa.TIMESTAMP(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("completed_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_batch_runs_status", "batch_runs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_batch_runs_status", table_name="batch_runs")
    op.drop_table("batch_runs")
