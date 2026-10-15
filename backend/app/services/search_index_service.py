"""Repeat-safe compatibility indexes for existing installations."""
from sqlalchemy import inspect, insert, select, text

from app.customer_search import name_search_suffixes
from app.models.customer import Customer, CustomerNameSearch
from app.models.data_migration import DataMigration
from app.models.invoice import Invoice

NAME_INDEX_VERSION = "2026-10-16-customer-name-suffixes-v1"
QUERY_INDEXES = {"ix_invoices_audit_handover", "ix_invoices_shipper_handover", "ix_invoices_audit_sale"}


def ensure_search_indexes(engine) -> None:
    with engine.connect() as connection:
        mysql = connection.dialect.name == "mysql"
        lock = "hana-search-indexes-v1"
        if mysql:
            acquired = connection.execute(text("SELECT GET_LOCK(:key, 60)"), {"key": lock}).scalar()
            connection.commit()
            if acquired != 1:
                raise RuntimeError("Không thể khóa cập nhật index tìm kiếm. Vui lòng thử lại")
        try:
            existing = inspect(connection).get_indexes("invoices")
            for index in sorted(Invoice.__table__.indexes, key=lambda item: item.name):
                if index.name not in QUERY_INDEXES:
                    continue
                columns = [column.name for column in index.columns]
                if not any(item["column_names"][:len(columns)] == columns for item in existing):
                    index.create(connection)
            connection.commit()
            with connection.begin():
                if connection.scalar(select(DataMigration.key).where(DataMigration.key == NAME_INDEX_VERSION)):
                    return
                # One-time keyset backfill; customer records are never modified.
                last_id = 0
                while True:
                    customers = connection.execute(select(Customer.id, Customer.name)
                        .where(Customer.id > last_id, Customer.deleted_at.is_(None))
                        .order_by(Customer.id).limit(500).with_for_update()).all()
                    if not customers:
                        break
                    rows = [{"term": suffix, "customer_id": customer.id}
                            for customer in customers for suffix in name_search_suffixes(customer.name)]
                    # Existing ORM inserts may already have populated rows before the first backfill.
                    connection.execute(CustomerNameSearch.__table__.delete().where(
                        CustomerNameSearch.customer_id.in_([customer.id for customer in customers])))
                    for offset in range(0, len(rows), 1000):
                        connection.execute(insert(CustomerNameSearch), rows[offset:offset + 1000])
                    last_id = customers[-1].id
                connection.execute(insert(DataMigration).values(key=NAME_INDEX_VERSION))
        finally:
            if mysql:
                connection.execute(text("SELECT RELEASE_LOCK(:key)"), {"key": lock})
                connection.commit()
