from pathlib import Path
from typing import Optional, Union
from pydantic import field_validator
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
    # Accepts a JSON array OR a comma-separated string, e.g.:
    #   ALLOWED_ORIGINS=https://app.vercel.app,http://localhost:3000
    ALLOWED_ORIGINS: Union[list[str], str] = ["http://localhost:3000"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            stripped = v.strip()
            if stripped.startswith("["):
                import json
                return json.loads(stripped)
            return [o.strip() for o in stripped.split(",") if o.strip()]
        return v  # type: ignore[return-value]

    model_config = {"env_file": str(_ENV_FILE), "extra": "ignore"}

    @property
    def effective_admin_url(self) -> str:
        return self.DATABASE_ADMIN_URL or self.DATABASE_URL


settings = Settings()
