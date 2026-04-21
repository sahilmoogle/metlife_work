"""add last_active_at to leads

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.add_column(sa.Column("last_active_at", sa.TIMESTAMP(), nullable=True))
    op.create_index(
        "ix_leads_last_active_at", "leads", ["last_active_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_leads_last_active_at", table_name="leads")
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.drop_column("last_active_at")
