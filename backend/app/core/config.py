from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings

# Resolve .env relative to this file (backend/app/core/config.py → backend/.env)
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    # Admin URL uses the DB owner role (BYPASSRLS) for auth-only operations.
    # Falls back to DATABASE_URL if not set (e.g., local dev with a single superuser).
    DATABASE_ADMIN_URL: Optional[str] = None
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    API_V1_STR: str = "/api/v1"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": str(_ENV_FILE), "extra": "ignore"}

    @property
    def effective_admin_url(self) -> str:
        return self.DATABASE_ADMIN_URL or self.DATABASE_URL


settings = Settings()
