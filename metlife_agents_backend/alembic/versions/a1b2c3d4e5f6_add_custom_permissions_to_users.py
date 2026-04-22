"""add_custom_permissions_to_users

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-21

Adds a nullable Text column ``custom_permissions`` to the ``users`` table.

Stores a JSON string of per-user permission overrides, e.g.:
    {"export_data": true, "hitl_approve": false}

Keys present override the role-default for that specific user.
Keys absent fall back to ROLE_PERMISSIONS[role] in permissions.py.
NULL = no overrides, pure role-based permissions apply.
"""

from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("custom_permissions", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("custom_permissions")
