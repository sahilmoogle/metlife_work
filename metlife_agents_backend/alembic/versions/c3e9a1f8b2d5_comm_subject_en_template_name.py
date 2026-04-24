"""Add subject_en + template_name to communications; subject_en to email_templates.

Revision ID: c3e9a1f8b2d5
Revises: a7e3f2b1c9d0
Create Date: 2026-04-24

Adds English-language subject labels so operators using the EN dashboard can read
email subjects without knowing Japanese, while the Japanese subject column (sent
to leads) remains unchanged.
"""

from alembic import op
import sqlalchemy as sa

revision = "c3e9a1f8b2d5"
down_revision = "a7e3f2b1c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # communications: English subject label + template reference
    with op.batch_alter_table("communications", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("subject_en", sa.String(length=500), nullable=True)
        )
        batch_op.add_column(
            sa.Column("template_name", sa.String(length=200), nullable=True)
        )

    # email_templates: English subject label for operator display
    with op.batch_alter_table("email_templates", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("subject_en", sa.String(length=500), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("email_templates", schema=None) as batch_op:
        batch_op.drop_column("subject_en")

    with op.batch_alter_table("communications", schema=None) as batch_op:
        batch_op.drop_column("template_name")
        batch_op.drop_column("subject_en")
