from typing import Optional
from pathlib import Path
from sqlalchemy.engine import URL
from config.v1 import BaseSettingsWrapper


class DatabaseConfig(BaseSettingsWrapper):
    """Configuration settings for Database connection with fallback to SQLite."""

    # Postgres settings
    POSTGRES_DB_NAME: Optional[str] = None
    POSTGRES_HOST: Optional[str] = None
    POSTGRES_PORT: Optional[int] = None
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None

    # SQLite fallback target
    SQLITE_DB_PATH: str = "metlife_agents.db"  # Can be overridden via .env

    def _resolve_sqlite_path(self) -> str:
        """
        Resolve SQLITE_DB_PATH to an absolute path.

        If SQLITE_DB_PATH is relative, make it relative to the backend package
        root (metlife_agents_backend/). This prevents different working
        directories (uvicorn vs alembic) from pointing to different DB files.
        """
        p = Path(self.SQLITE_DB_PATH)
        if p.is_absolute():
            return str(p)
        backend_root = Path(__file__).resolve().parents[2]
        return str(backend_root / p)

    def get_database_url(self) -> URL | str:
        """Returns connection string depending on available environment config."""
        if all(
            [
                self.POSTGRES_HOST,
                self.POSTGRES_USER,
                self.POSTGRES_PASSWORD,
                self.POSTGRES_DB_NAME,
            ]
        ):
            return URL.create(
                drivername="postgresql+asyncpg",
                username=self.POSTGRES_USER,
                password=self.POSTGRES_PASSWORD,
                host=self.POSTGRES_HOST,
                port=self.POSTGRES_PORT or 5432,
                database=self.POSTGRES_DB_NAME,
            )
        # Fallback to SQLite
        sqlite_path = self._resolve_sqlite_path()
        return f"sqlite+aiosqlite:///{sqlite_path}"

    def is_sqlite(self) -> bool:
        return not all(
            [
                self.POSTGRES_HOST,
                self.POSTGRES_USER,
                self.POSTGRES_PASSWORD,
                self.POSTGRES_DB_NAME,
            ]
        )


db_config = DatabaseConfig()
