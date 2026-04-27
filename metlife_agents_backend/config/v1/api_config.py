from typing import Optional

from config.v1 import BaseSettingsWrapper


class APIConfig(BaseSettingsWrapper):
    """
    Configuration class for API settings.

    :param PROJECT_NAME: The name of the project
    :type PROJECT_NAME: str

    :param BACKEND_CORS_ORIGINS: Origins for CORS. If None, CORS is disabled.
    :type BACKEND_CORS_ORIGINS: Optional[str]

    :param API_VER_STR_V1: Version string for API v1
    :type API_VER_STR_V1: str
    """

    PROJECT_NAME: str = "metlife-agents-backend"
    BACKEND_CORS_ORIGINS: Optional[str] = None
    API_VER_STR_V1: str = "/api/v1"

    # Send Engine quiet-hours window in JST.
    QUIET_START_JST_HOUR: int = 21
    QUIET_END_JST_HOUR: int = 8

    # Internal automatic timer processor for quiet-hours/cadence/S4 timers.
    AUTO_TIMER_PROCESSOR_ENABLED: bool = True
    AUTO_TIMER_PROCESSOR_INTERVAL_SECONDS: int = 30
    AUTO_TIMER_PROCESSOR_LIMIT: int = 25


api_config = APIConfig()
