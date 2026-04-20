from config.v1 import BaseSettingsWrapper


class JWTConfig(BaseSettingsWrapper):
    """JWT configuration settings."""

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int


jwt_config = JWTConfig()
