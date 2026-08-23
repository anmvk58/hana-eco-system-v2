import json
import os
from pathlib import Path
from functools import lru_cache

from pydantic import BaseModel, Field
from sqlalchemy.engine import URL


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
    database_url: str
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])
    cors_origin_regex: str | None = None


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

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        required_database_settings = ("MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD")
        missing = [name for name in required_database_settings if not os.getenv(name)]
        if missing:
            raise RuntimeError(f"Thiếu cấu hình kết nối cơ sở dữ liệu: {', '.join(missing)}")
        try:
            mysql_port = int(os.getenv("MYSQL_PORT", "3306"))
        except ValueError as exc:
            raise RuntimeError("MYSQL_PORT phải là một số nguyên hợp lệ") from exc
        database_url = URL.create(
            drivername="mysql+pymysql",
            username=os.environ["MYSQL_USER"],
            password=os.environ["MYSQL_PASSWORD"],
            host=os.getenv("MYSQL_HOST", "localhost"),
            port=mysql_port,
            database=os.environ["MYSQL_DATABASE"],
            query={"charset": "utf8mb4"},
        ).render_as_string(hide_password=False)

    return Settings(
        app_name=os.getenv("APP_NAME", "Hana POS API"),
        api_prefix=os.getenv("API_PREFIX", "/api"),
        database_url=database_url,
        cors_origins=parsed_origins,
        cors_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    )
