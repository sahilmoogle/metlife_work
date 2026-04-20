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


api_config = APIConfig()
