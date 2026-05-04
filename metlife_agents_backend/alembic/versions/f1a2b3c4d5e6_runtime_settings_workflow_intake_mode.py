"""Add runtime_settings table for workflow intake mode toggle.

Revision ID: f1a2b3c4d5e6
Revises: d9b4f7a2c6e1
Create Date: 2026-05-04

"""

import uuid
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "d9b4f7a2c6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runtime_settings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=512), nullable=False),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )

    # Seed the default: automatic mode (existing behaviour is preserved)
    op.execute(
        sa.text(
            "INSERT INTO runtime_settings (id, key, value) VALUES (:id, :key, :value)"
        ).bindparams(
            id=str(uuid.uuid4()),
            key="workflow_intake_mode",
            value="automatic",
        )
    )


def downgrade() -> None:
    op.drop_table("runtime_settings")
