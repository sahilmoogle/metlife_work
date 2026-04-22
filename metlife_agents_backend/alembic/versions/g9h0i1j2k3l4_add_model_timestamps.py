"""add updated_at / created_at on models missing them

Revision ID: g9h0i1j2k3l4
Revises: f7a8b9c0d1e2
Create Date: 2026-04-22

Adds ``updated_at`` where only ``created_at`` existed, ``updated_at`` on
``batch_runs`` (creation remains ``started_at``), and ``created_at`` /
``updated_at`` on ``blacklisted_tokens`` (backfilled from ``blacklisted_at``).
"""

from alembic import op
import sqlalchemy as sa

revision = "g9h0i1j2k3l4"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None

_TS = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    tables_with_created = [
        "consultation_requests",
        "hitl_queue",
        "audit_logs",
        "quotes",
        "communications",
        "email_events",
        "sse_events",
    ]
    for name in tables_with_created:
        with op.batch_alter_table(name, schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "updated_at",
                    sa.TIMESTAMP(),
                    server_default=_TS,
                    nullable=False,
                )
            )

    op.execute("UPDATE consultation_requests SET updated_at = created_at WHERE 1=1")
    op.execute("UPDATE hitl_queue SET updated_at = created_at WHERE 1=1")
    op.execute("UPDATE audit_logs SET updated_at = created_at WHERE 1=1")
    op.execute("UPDATE quotes SET updated_at = created_at WHERE 1=1")
    op.execute("UPDATE communications SET updated_at = created_at WHERE 1=1")
    op.execute("UPDATE email_events SET updated_at = created_at WHERE 1=1")
    op.execute("UPDATE sse_events SET updated_at = created_at WHERE 1=1")

    with op.batch_alter_table("batch_runs", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.TIMESTAMP(),
                server_default=_TS,
                nullable=False,
            )
        )
    op.execute("UPDATE batch_runs SET updated_at = started_at WHERE 1=1")

    with op.batch_alter_table("blacklisted_tokens", schema=None) as batch_op:
        batch_op.add_column(sa.Column("created_at", sa.TIMESTAMP(), nullable=True))
        batch_op.add_column(sa.Column("updated_at", sa.TIMESTAMP(), nullable=True))

    op.execute(
        "UPDATE blacklisted_tokens SET created_at = COALESCE(blacklisted_at, CURRENT_TIMESTAMP), "
        "updated_at = COALESCE(blacklisted_at, CURRENT_TIMESTAMP)"
    )

    with op.batch_alter_table("blacklisted_tokens", schema=None) as batch_op:
        batch_op.alter_column(
            "created_at",
            existing_type=sa.TIMESTAMP(),
            nullable=False,
            server_default=_TS,
        )
        batch_op.alter_column(
            "updated_at",
            existing_type=sa.TIMESTAMP(),
            nullable=False,
            server_default=_TS,
        )


def downgrade() -> None:
    with op.batch_alter_table("blacklisted_tokens", schema=None) as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("created_at")

    with op.batch_alter_table("batch_runs", schema=None) as batch_op:
        batch_op.drop_column("updated_at")

    for name in reversed(
        [
            "sse_events",
            "email_events",
            "communications",
            "quotes",
            "audit_logs",
            "hitl_queue",
            "consultation_requests",
        ]
    ):
        with op.batch_alter_table(name, schema=None) as batch_op:
            batch_op.drop_column("updated_at")
