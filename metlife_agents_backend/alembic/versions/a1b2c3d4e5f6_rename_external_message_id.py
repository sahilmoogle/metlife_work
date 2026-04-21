"""rename_external_message_id_to_internal_message_ref

Remove the Adobe-Campaign-era column name from the communications table.
The column is repurposed as an internal deduplication reference written by
send_engine — no external provider is involved.

Revision ID: a1b2c3d4e5f6
Revises: 513b87b07032
Create Date: 2026-04-21 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "513b87b07032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old index BEFORE entering batch context.
    # SQLite's batch mode rebuilds the whole table; mixing drop_index +
    # alter_column (rename) + create_index in one batch context causes a
    # KeyError because Alembic tries to look up the new column name in the
    # old index definition before the rename has been applied.
    op.execute("DROP INDEX IF EXISTS ix_communications_external_message_id")

    # Rename the column (batch mode required for SQLite)
    with op.batch_alter_table("communications", schema=None) as batch_op:
        batch_op.alter_column(
            "external_message_id",
            new_column_name="internal_message_ref",
            existing_type=sa.String(length=200),
            existing_nullable=True,
        )

    # Create the replacement index AFTER the batch context has closed
    op.create_index(
        "ix_communications_internal_message_ref",
        "communications",
        ["internal_message_ref"],
        unique=False,
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_communications_internal_message_ref")

    with op.batch_alter_table("communications", schema=None) as batch_op:
        batch_op.alter_column(
            "internal_message_ref",
            new_column_name="external_message_id",
            existing_type=sa.String(length=200),
            existing_nullable=True,
        )

    op.create_index(
        "ix_communications_external_message_id",
        "communications",
        ["external_message_id"],
        unique=False,
    )
