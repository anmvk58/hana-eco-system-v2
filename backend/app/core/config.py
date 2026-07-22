import json
import os
from pathlib import Path
from functools import lru_cache

from pydantic import BaseModel, Field


def load_env_file() -> None:
    env_paths = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ]
    for env_path in env_paths:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class Settings(BaseModel):
    app_name: str = "Hana POS API"
    api_prefix: str = "/api"
    database_url: str = "mysql+pymysql://hana:hana_password@localhost:3306/hana_pos?charset=utf8mb4"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])


@lru_cache
def get_settings() -> Settings:
    load_env_file()
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
        database_url=os.getenv("DATABASE_URL", "mysql+pymysql://hana:hana_password@localhost:3306/hana_pos?charset=utf8mb4"),
        cors_origins=parsed_origins,
    )
