import asyncio
import time
import random
import string
import logging
import logging.config
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.middleware.cors import CORSMiddleware

from config.v1.api_config import api_config
from core.fastapi_blueprint import connect_router as connect_router_v1

from utils.v1.errors import InternalServerException
from utils.v1.connections import (
    check_connections,
    create_connections,
    engine,
    remove_connections,
)

_LOG_CONF = Path(__file__).parent / "config" / "v1" / "logging.conf"
logging.config.fileConfig(_LOG_CONF, disable_existing_loggers=False)

logger = logging.getLogger(__name__)


async def _reset_processing_timers() -> None:
    SchedulerSessionLocal = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    async with SchedulerSessionLocal() as db:
        await db.execute(
            text(
                "UPDATE workflow_timers SET status='pending' WHERE status='processing'"
            )
        )
        await db.commit()


async def _auto_timer_processor_loop(*, interval_s: int, limit: int) -> None:
    from core.v1.api.agents.agent_api import process_due_workflow_timers

    SchedulerSessionLocal = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )

    logger.info(
        "Auto timer processor enabled: quiet-hours/cadence timers every %ss (limit=%s).",
        interval_s,
        limit,
    )

    await _reset_processing_timers()

    try:
        while True:
            try:
                async with SchedulerSessionLocal() as db:
                    await process_due_workflow_timers(limit=limit, _={}, db=db)
            except Exception as exc:
                logger.error("Auto timer processor failed: %s", exc, exc_info=True)
                try:
                    await _reset_processing_timers()
                except Exception as cleanup_exc:
                    logger.error(
                        "Auto timer processor cleanup failed: %s",
                        cleanup_exc,
                        exc_info=True,
                    )

            await asyncio.sleep(max(1, interval_s))
    except asyncio.CancelledError:
        logger.info("Auto timer processor stopped.")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown logic."""
    create_connections()
    await check_connections()

    timer_task: asyncio.Task | None = None
    if api_config.AUTO_TIMER_PROCESSOR_ENABLED:
        timer_task = asyncio.create_task(
            _auto_timer_processor_loop(
                interval_s=api_config.AUTO_TIMER_PROCESSOR_INTERVAL_SECONDS,
                limit=api_config.AUTO_TIMER_PROCESSOR_LIMIT,
            ),
            name="metlife-auto-timer-processor",
        )
        app.state.auto_timer_processor_task = timer_task

    yield

    if timer_task is not None:
        timer_task.cancel()
        try:
            await timer_task
        except asyncio.CancelledError:
            pass
    await remove_connections()


application = FastAPI(
    title=api_config.PROJECT_NAME,
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


@application.exception_handler(InternalServerException)
async def internal_server_exception_handler(
    _request: Request, exception: InternalServerException
):
    message = exception.message or "Internal Server Error"
    return JSONResponse(status_code=500, content={"message": message})


@application.middleware("http")
async def log_requests(request: Request, call_next):
    idem = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    logger.info(f"rid={idem} start request path={request.url.path}")
    start_time = time.time()

    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    formatted_process_time = "{0:.2f}".format(process_time)
    logger.info(
        f"rid={idem} completed_in={formatted_process_time}ms status_code={response.status_code}"
    )
    return response


if api_config.BACKEND_CORS_ORIGINS:
    logger.info("Adding CORS Origins")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            str(origin) for origin in api_config.BACKEND_CORS_ORIGINS.split(",")
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


application.include_router(connect_router_v1, prefix=api_config.API_VER_STR_V1)


@application.get("/health-check")
def health_check():
    return {"status": "ok", "service": "MetLife Agentic AI Backend V1"}
