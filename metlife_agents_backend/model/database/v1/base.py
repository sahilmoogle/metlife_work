"""
Base declarative model and cross-database GUID type.

GUID TypeDecorator maps to:
  • PostgreSQL  →  native UUID column
  • SQLite      →  CHAR(36) stored as hex-hyphenated string

Every model in this package inherits from ``Base``.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, TypeDecorator
from sqlalchemy.orm import declarative_base

try:
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID
except ImportError:  # pragma: no cover
    PG_UUID = None  # type: ignore[assignment,misc]

Base = declarative_base()


def _utcnow() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(timezone.utc)


class GUID(TypeDecorator):
    """Platform-independent UUID type.

    Uses PostgreSQL's native UUID when the dialect is ``postgresql``,
    otherwise falls back to ``CHAR(36)`` for SQLite / other engines.
    """

    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql" and PG_UUID is not None:
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(value)
        return str(value) if isinstance(value, uuid.UUID) else value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            return uuid.UUID(value)
        return value
