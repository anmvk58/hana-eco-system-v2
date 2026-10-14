from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings


settings = get_settings()

engine = create_engine(
    settings.database_url, future=True,
    connect_args={"init_command": "SET time_zone = '+00:00'"} if settings.database_url.startswith("mysql+pymysql:") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
