"""Added -role_id in user table

Revision ID: 32b600a711ba
Revises: e5f6a7b8c9d0
Create Date: 2026-04-21 19:08:54.956418

Creates ``roles`` / ``permissions`` / ``role_permissions``, seeds the
fixed 4 roles + 8 permissions + default role-permission matrix, then
swaps the legacy ``users.role`` VARCHAR for a nullable ``users.role_id``
FK (backfilled from the old column before it is dropped).
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '32b600a711ba'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_ROLES = ("admin", "manager", "reviewer", "viewer")

DEFAULT_PERMISSIONS = (
    "run_workflow",
    "start_agent",
    "hitl_approve",
    "hitl_reject",
    "edit_lead",
    "export_data",
    "manage_users",
    "view_audit_log",
)

ROLE_PERMISSION_MATRIX = {
    "admin": set(DEFAULT_PERMISSIONS),
    "manager": {
        "run_workflow", "start_agent", "hitl_approve", "hitl_reject",
        "edit_lead", "export_data", "view_audit_log",
    },
    "reviewer": {"hitl_approve", "hitl_reject", "view_audit_log"},
    "viewer": set(),
}


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('permissions',
    sa.Column('permission_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.PrimaryKeyConstraint('permission_id')
    )
    with op.batch_alter_table('permissions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_permissions_name'), ['name'], unique=True)

    op.create_table('roles',
    sa.Column('role_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.PrimaryKeyConstraint('role_id')
    )
    with op.batch_alter_table('roles', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_roles_name'), ['name'], unique=True)

    op.create_table('role_permissions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('role_id', sa.String(length=36), nullable=False),
    sa.Column('permission_id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['permission_id'], ['permissions.permission_id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['role_id'], ['roles.role_id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('role_id', 'permission_id', name='uq_role_permission')
    )

    # ── Seed the 4 fixed roles + 8 fixed permissions + mapping matrix ──
    roles_table = sa.table(
        "roles",
        sa.column("role_id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        roles_table,
        [
            {"role_id": str(uuid.uuid4()), "name": n,
             "description": f"Default {n} role", "is_active": True}
            for n in DEFAULT_ROLES
        ],
    )

    permissions_table = sa.table(
        "permissions",
        sa.column("permission_id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        permissions_table,
        [
            {"permission_id": str(uuid.uuid4()), "name": n,
             "description": f"Default {n} permission", "is_active": True}
            for n in DEFAULT_PERMISSIONS
        ],
    )

    bind = op.get_bind()
    role_ids = {r.name: r.role_id for r in
                bind.execute(sa.text("SELECT role_id, name FROM roles")).fetchall()}
    perm_ids = {p.name: p.permission_id for p in
                bind.execute(sa.text("SELECT permission_id, name FROM permissions")).fetchall()}

    role_permissions_table = sa.table(
        "role_permissions",
        sa.column("id", sa.String),
        sa.column("role_id", sa.String),
        sa.column("permission_id", sa.String),
    )
    mappings = [
        {"id": str(uuid.uuid4()),
         "role_id": role_ids[role], "permission_id": perm_ids[perm]}
        for role, perms in ROLE_PERMISSION_MATRIX.items()
        for perm in perms
    ]
    if mappings:
        op.bulk_insert(role_permissions_table, mappings)

    with op.batch_alter_table('communications', schema=None) as batch_op:
        batch_op.alter_column('channel',
               existing_type=sa.VARCHAR(length=30),
               type_=sa.String(length=10),
               existing_nullable=True)

    # ── Add users.role_id, backfill from users.role, drop users.role ──
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role_id', sa.String(length=36), nullable=True))
        batch_op.create_foreign_key('fk_users_role_id', 'roles', ['role_id'], ['role_id'], ondelete='SET NULL')

    op.execute(
        "UPDATE users SET role_id = ("
        "  SELECT role_id FROM roles WHERE LOWER(roles.name) = LOWER(users.role)"
        ") WHERE role IS NOT NULL"
    )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('role')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role', sa.VARCHAR(length=50), nullable=True))

    op.execute(
        "UPDATE users SET role = ("
        "  SELECT name FROM roles WHERE roles.role_id = users.role_id"
        ")"
    )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_role_id', type_='foreignkey')
        batch_op.drop_column('role_id')

    with op.batch_alter_table('communications', schema=None) as batch_op:
        batch_op.alter_column('channel',
               existing_type=sa.String(length=10),
               type_=sa.VARCHAR(length=30),
               existing_nullable=True)

    op.drop_table('role_permissions')
    with op.batch_alter_table('permissions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_permissions_name'))
    op.drop_table('permissions')
    with op.batch_alter_table('roles', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_roles_name'))
    op.drop_table('roles')
