"""One-time, transactional conversion of legacy Vietnam-local sale times."""
from datetime import datetime
from sqlalchemy import select, text, update
from app.models.data_migration import DataMigration, TimeNormalizationBackup
from app.models.invoice import Invoice, InvoiceHistory
from app.services.time_service import to_utc_naive, utc_iso, utc_now

MIGRATION_KEY = "2026-10-11-invoice-sale-times-utc"


def migrate_sale_times(connection) -> bool:
    """Caller owns the transaction. A marker and backups commit with the conversion."""
    if connection.execute(select(DataMigration.key).where(DataMigration.key == MIGRATION_KEY)).scalar():
        return False
    for row in connection.execute(select(Invoice.id, Invoice.sold_at)).mappings().all():
        connection.execute(TimeNormalizationBackup.__table__.insert().values(
            migration_key=MIGRATION_KEY, record_type="invoice", record_id=row["id"],
            original_data={"sold_at": row["sold_at"].isoformat()},
        ))
        connection.execute(update(Invoice).where(Invoice.id == row["id"]).values(
            sold_at=to_utc_naive(row["sold_at"]), updated_at=Invoice.updated_at,
        ))
    for row in connection.execute(select(InvoiceHistory.id, InvoiceHistory.before_data, InvoiceHistory.after_data)).mappings().all():
        changes = {}
        for field in ("before_data", "after_data"):
            snapshot = row[field]
            if snapshot:
                normalized = dict(snapshot)
                for key in ("sold_at", "audited_at", "delivered_at", "deleted_at"):
                    if normalized.get(key):
                        value = datetime.fromisoformat(normalized[key].replace("Z", "+00:00"))
                        normalized[key] = utc_iso(to_utc_naive(value) if key == "sold_at" else value)
                if normalized != snapshot:
                    changes[field] = normalized
        if changes:
            connection.execute(TimeNormalizationBackup.__table__.insert().values(
                migration_key=MIGRATION_KEY, record_type="history", record_id=row["id"],
                original_data={"before_data": row["before_data"], "after_data": row["after_data"]},
            ))
            connection.execute(update(InvoiceHistory).where(InvoiceHistory.id == row["id"]).values(**changes))
    connection.execute(DataMigration.__table__.insert().values(key=MIGRATION_KEY, applied_at=utc_now()))
    return True


def ensure_utc_sale_times(engine) -> None:
    # MySQL advisory lock coordinates startup across workers; the data transaction is atomic.
    with engine.connect() as connection:
        mysql = connection.dialect.name == "mysql"
        if mysql:
            acquired = connection.execute(text("SELECT GET_LOCK(:key, 60)"), {"key": MIGRATION_KEY}).scalar()
            connection.commit()
            if acquired != 1:
                raise RuntimeError("Không thể khóa dữ liệu để chuẩn hóa thời gian. Vui lòng thử lại")
        try:
            with connection.begin():
                migrate_sale_times(connection)
        finally:
            if mysql:
                connection.execute(text("SELECT RELEASE_LOCK(:key)"), {"key": MIGRATION_KEY})
                connection.commit()
