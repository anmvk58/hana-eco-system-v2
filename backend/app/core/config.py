import json
import os
from functools import lru_cache

from pydantic import BaseModel, Field


class Settings(BaseModel):
    app_name: str = "Hana POS API"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./hana_pos.db"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])


@lru_cache
def get_settings() -> Settings:
    cors_origins = os.getenv("CORS_ORIGINS")
    parsed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
    if cors_origins:
        try:
            parsed_origins = json.loads(cors_origins)
        except json.JSONDecodeError:
            parsed_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]

    return Settings(
        app_name=os.getenv("APP_NAME", "Hana POS API"),
        api_prefix=os.getenv("API_PREFIX", "/api"),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./hana_pos.db"),
        cors_origins=parsed_origins,
    )
