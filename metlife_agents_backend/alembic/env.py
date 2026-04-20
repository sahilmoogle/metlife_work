"""
Alembic environment – works with both PostgreSQL and SQLite.

• render_as_batch=True for SQLite ALTER TABLE.
• Custom render_item so GUID columns emit sa.String(36) in migration files.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

from config.v1.database_config import db_config
from model.database.v1 import Base  # noqa: F401  – loads all models
from model.database.v1.base import GUID

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Sync-compatible DB URL ──────────────────────────────────────────
db_url = str(db_config.get_database_url())
db_url = db_url.replace("postgresql+asyncpg", "postgresql+psycopg2").replace(
    "sqlite+aiosqlite", "sqlite"
)
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = Base.metadata


# ── Custom type renderer ───────────────────────────────────────────
def render_item(type_, obj, autogen_context):
    """Render our GUID type as sa.String(36) so migrations are portable."""
    if type_ == "type" and isinstance(obj, GUID):
        autogen_context.imports.add("import sqlalchemy as sa")
        return "sa.String(length=36)"
    return False  # default rendering


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
