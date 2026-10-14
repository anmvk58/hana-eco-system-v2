from datetime import datetime
from sqlalchemy import DateTime, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.services.time_service import utc_now


class DataMigration(Base):
    __tablename__ = "data_migrations"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class TimeNormalizationBackup(Base):
    """Original values retained for auditing or an explicit rollback of the migration."""
    __tablename__ = "time_normalization_backups"
    __table_args__ = (UniqueConstraint("migration_key", "record_type", "record_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    migration_key: Mapped[str] = mapped_column(String(100), nullable=False)
    record_type: Mapped[str] = mapped_column(String(40), nullable=False)
    record_id: Mapped[int] = mapped_column(nullable=False)
    original_data: Mapped[dict] = mapped_column(JSON, nullable=False)
