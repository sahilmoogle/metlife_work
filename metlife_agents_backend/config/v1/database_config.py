from typing import Optional
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
        return f"sqlite+aiosqlite:///{self.SQLITE_DB_PATH}"

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
