import time
import random
import string
import logging

from fastapi import FastAPI, Request
from fastapi.logger import logger as fastapi_logger
from fastapi.responses import JSONResponse

from starlette.middleware.cors import CORSMiddleware

from config.v1.api_config import api_config
from core.fastapi_blueprint import connect_router as connect_router_v1

from utils.v1.errors import InternalServerException
from utils.v1.connections import (
    check_connections,
    create_connections,
    remove_connections,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s:\t%(name)s - %(message)s")


logger = logging.getLogger(__name__)

fastapi_logger.handlers = logger.handlers

application = FastAPI(title=api_config.PROJECT_NAME, openapi_url="/openapi.json")


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


@application.on_event("startup")
async def startup():
    create_connections()
    await check_connections()


@application.on_event("shutdown")
async def shutdown():
    await remove_connections()


# Include API routers

application.include_router(connect_router_v1, prefix=api_config.API_VER_STR_V1)


# Health check endpoint
@application.post("/health-check")
def health_check():
    return "AI metlife agents Backend V1 APIs"
