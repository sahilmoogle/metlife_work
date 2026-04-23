"""Add batch_id to hitl_queue for batch-scoped review counts.

Revision ID: a7e3f2b1c9d0
Revises: 10d02edfa1d3
Create Date: 2026-04-23

"""

from alembic import op
import sqlalchemy as sa

revision = "a7e3f2b1c9d0"
down_revision = "10d02edfa1d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("hitl_queue", schema=None) as batch_op:
        batch_op.add_column(sa.Column("batch_id", sa.String(length=36), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_hitl_queue_batch_id"), ["batch_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("hitl_queue", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_hitl_queue_batch_id"))
        batch_op.drop_column("batch_id")
