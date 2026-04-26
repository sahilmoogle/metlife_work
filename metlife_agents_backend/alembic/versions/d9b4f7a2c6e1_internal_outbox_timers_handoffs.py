"""Add internal outbox, timers, and sales handoffs.

Revision ID: d9b4f7a2c6e1
Revises: c3e9a1f8b2d5
Create Date: 2026-04-25

"""

from alembic import op
import sqlalchemy as sa

revision = "d9b4f7a2c6e1"
down_revision = "c3e9a1f8b2d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_outbox",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("thread_id", sa.String(length=100), nullable=True),
        sa.Column("subject", sa.String(length=500), nullable=True),
        sa.Column("subject_en", sa.String(length=500), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("template_name", sa.String(length=200), nullable=True),
        sa.Column("email_number", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=30), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("hold_reason", sa.String(length=200), nullable=True),
        sa.Column("scheduled_for", sa.TIMESTAMP(), nullable=True),
        sa.Column("sent_at", sa.TIMESTAMP(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("email_outbox", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_email_outbox_lead_id"), ["lead_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_email_outbox_thread_id"), ["thread_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_email_outbox_status"), ["status"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_email_outbox_scheduled_for"),
            ["scheduled_for"],
            unique=False,
        )

    op.create_table(
        "workflow_timers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=True),
        sa.Column("thread_id", sa.String(length=100), nullable=False),
        sa.Column("timer_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("due_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("payload", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("workflow_timers", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_workflow_timers_lead_id"), ["lead_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_workflow_timers_thread_id"), ["thread_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_workflow_timers_timer_type"),
            ["timer_type"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_workflow_timers_status"), ["status"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_workflow_timers_due_at"), ["due_at"], unique=False
        )

    op.create_table(
        "sales_handoffs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("thread_id", sa.String(length=100), nullable=False),
        sa.Column("scenario_id", sa.String(length=5), nullable=True),
        sa.Column("score_snapshot", sa.Float(), nullable=True),
        sa.Column("briefing", sa.Text(), nullable=True),
        sa.Column("source_gate", sa.String(length=10), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=True),
        sa.Column("assigned_to", sa.String(length=100), nullable=True),
        sa.Column("reviewer_notes", sa.Text(), nullable=True),
        sa.Column(
            "accepted_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column("completed_at", sa.TIMESTAMP(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("sales_handoffs", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_sales_handoffs_lead_id"), ["lead_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_sales_handoffs_thread_id"), ["thread_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_sales_handoffs_scenario_id"),
            ["scenario_id"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_sales_handoffs_status"), ["status"], unique=False
        )


def downgrade() -> None:
    op.drop_table("sales_handoffs")
    op.drop_table("workflow_timers")
    op.drop_table("email_outbox")
