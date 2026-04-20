from collections.abc import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from config.v1.database_config import db_config
import logging

logger = logging.getLogger("uvicorn.error")

db_url = db_config.get_database_url()
connect_args = {"check_same_thread": False} if db_config.is_sqlite() else {}

engine = create_async_engine(
    db_url,
    connect_args=connect_args,
)

SessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, autocommit=False, autoflush=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        await db.close()


def create_connections() -> AsyncSession:
    """Create and return a new database connection."""
    return SessionLocal()


async def check_connections() -> bool:
    """Test database connection. Returns True if successful, False otherwise."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection established successfully.")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False


async def remove_connections():
    """Dispose of the database engine."""
    await engine.dispose()
    logger.info("Database connection closed gracefully.")
