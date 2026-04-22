"""add consolidated xlsx source columns (leads, consultation_requests, email_events, communications)

Revision ID: f7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-22

Stores fields from client TYecQuoteMst / TConsultReq / AdobeAnalytics feeds
that had no column previously.
"""

from alembic import op
import sqlalchemy as sa

revision = "f7a8b9c0d1e2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.add_column(sa.Column("plan_code", sa.String(length=50), nullable=True))
        batch_op.add_column(
            sa.Column("accept_mail_error", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column("session_id", sa.String(length=200), nullable=True)
        )

    op.create_index("ix_leads_session_id", "leads", ["session_id"], unique=False)

    with op.batch_alter_table("consultation_requests", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("request_id", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("prefecture", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(sa.Column("zip_code", sa.String(length=20), nullable=True))
        batch_op.add_column(
            sa.Column("campaign_code", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("contract_status", sa.String(length=100), nullable=True)
        )

    op.create_index(
        "ix_consultation_requests_request_id",
        "consultation_requests",
        ["request_id"],
        unique=False,
    )

    with op.batch_alter_table("email_events", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("campaign_id", sa.String(length=100), nullable=True)
        )

    op.create_index(
        "ix_email_events_campaign_id", "email_events", ["campaign_id"], unique=False
    )

    with op.batch_alter_table("communications", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("campaign_id", sa.String(length=100), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("communications", schema=None) as batch_op:
        batch_op.drop_column("campaign_id")

    op.drop_index("ix_email_events_campaign_id", table_name="email_events")
    with op.batch_alter_table("email_events", schema=None) as batch_op:
        batch_op.drop_column("campaign_id")

    op.drop_index(
        "ix_consultation_requests_request_id", table_name="consultation_requests"
    )
    with op.batch_alter_table("consultation_requests", schema=None) as batch_op:
        batch_op.drop_column("contract_status")
        batch_op.drop_column("campaign_code")
        batch_op.drop_column("zip_code")
        batch_op.drop_column("prefecture")
        batch_op.drop_column("request_id")

    op.drop_index("ix_leads_session_id", table_name="leads")
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.drop_column("session_id")
        batch_op.drop_column("accept_mail_error")
        batch_op.drop_column("plan_code")
