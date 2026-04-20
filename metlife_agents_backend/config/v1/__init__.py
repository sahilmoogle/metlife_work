from pathlib import Path

from pydantic_settings import BaseSettings


class BaseSettingsWrapper(BaseSettings):
    class Config:
        base_dir = Path(__file__).resolve().parents[2]
        env_file = base_dir / ".env"
        case_sensitive = True
        extra = "allow"
