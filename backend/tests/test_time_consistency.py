"""Calendar boundaries, API timestamps, and one-time legacy conversion."""
import os
import unittest
from datetime import date, datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.models import Base, Invoice, InvoiceHistory, InvoiceItem, User, Shipper
from app.models.data_migration import DataMigration, TimeNormalizationBackup
from app.models.enums import InvoiceAuditLabel, InvoiceHistoryAction
from app.schemas.invoice import InvoiceRead
from app.services import invoice_service, report_service, order_reconciliation_service, ship_management_service, shipping_service
from app.services.dashboard_service import date_range, get_dashboard_order_status_charts
from app.services.internal_cod_collection_service import pending_invoice_query
from app.services.time_service import to_utc_naive, utc_to_vietnam, vietnam_day_utc_bounds
from app.services.time_migration_service import migrate_sale_times

DAY = date(2026, 10, 11)


class CalendarConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.user = User(username="shipper", display_name="Shipper")
        self.shipper = Shipper(user=self.user)
        self.db.add(self.shipper)
        self.db.flush()
        # 23:59 yesterday, midnight today, 23:59 today, midnight tomorrow (Vietnam).
        for index, when in enumerate([
            datetime(2026, 10, 10, 16, 59, 59), datetime(2026, 10, 10, 17),
            datetime(2026, 10, 11, 16, 59, 59), datetime(2026, 10, 11, 17),
        ]):
            invoice = Invoice(code=f"I{index}", sold_at=when, created_at=when, audited_at=when,
                              assigned_shipper_id=self.shipper.id, audit_label=InvoiceAuditLabel.internal_shipper,
                              total_amount=10, subtotal=10)
            invoice.items.append(InvoiceItem(product_code=f"P{index}", product_name="Test", unit="cái",
                                             quantity=1, unit_price=10, line_total=10))
            self.db.add(invoice)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_all_invoice_sale_filters_match(self):
        invoices = invoice_service.list_invoices(self.db, from_date=DAY, to_date=DAY)[0]
        self.assertEqual({i.code for i in invoices}, {"I1", "I2"})
        sold_products = report_service.sold_products(self.db, DAY, DAY)
        self.assertEqual({r["product_code"] for r in sold_products}, {"P1", "P2"})
        charts = get_dashboard_order_status_charts(self.db, DAY, DAY)
        self.assertEqual(sum(point.value for point in charts.audit_chart), 2)
        matching = self.db.scalars(select(Invoice).where(*order_reconciliation_service.sale_date_conditions(DAY, DAY))).all()
        self.assertEqual({i.code for i in matching}, {"I1", "I2"})

    def test_claimed_handover_and_cod_use_same_calendar_day(self):
        claimed = shipping_service.list_claimed_invoices(self.db, DAY, DAY, self.user)
        handovers = ship_management_service.list_internal_shipper_assignments(self.db, DAY, DAY)
        cod = self.db.scalars(pending_invoice_query(DAY)).all()
        self.assertEqual({i.code for i in claimed}, {"I1", "I2"})
        self.assertEqual({r["invoice"].code for r in handovers}, {"I1", "I2"})
        self.assertEqual({i.code for i in cod}, {"I1", "I2"})

    def test_clear_handover_dates_means_all_dates(self):
        self.assertEqual(len(ship_management_service.list_internal_shipper_assignments(self.db, None, None)), 4)

    def test_invalid_invoice_range(self):
        with self.assertRaises(HTTPException):
            invoice_service.list_invoices(self.db, from_date=DAY + timedelta(days=1), to_date=DAY)

    def test_api_has_utc_offsets_in_nested_fields(self):
        invoice = self.db.scalar(select(Invoice).where(Invoice.code == "I1"))
        payload = InvoiceRead.model_validate(invoice).model_dump(mode="json")
        self.assertEqual(payload["sold_at"], "2026-10-10T17:00:00Z")
        self.assertTrue(payload["created_at"].endswith("Z"))
        self.assertTrue(payload["items"][0]["created_at"].endswith("Z"))
        self.assertEqual(to_utc_naive(datetime.fromisoformat(payload["sold_at"].replace("Z", "+00:00"))), invoice.sold_at)

    def test_input_offsets_and_legacy_naive_sale_time(self):
        local = datetime(2026, 10, 11, 0, 30)
        expected = datetime(2026, 10, 10, 17, 30)
        self.assertEqual(to_utc_naive(local), expected)
        self.assertEqual(to_utc_naive(local.replace(tzinfo=timezone(timedelta(hours=7)))), expected)
        self.assertEqual(to_utc_naive(expected.replace(tzinfo=timezone.utc)), expected)
        self.assertEqual(utc_to_vietnam(expected).date(), DAY)

    def test_dashboard_range_is_same_utc_boundary(self):
        self.assertEqual(date_range(DAY, DAY)[2:], vietnam_day_utc_bounds(DAY))
        self.assertEqual(date_range(DAY, None)[2:], vietnam_day_utc_bounds(DAY))


class LegacyTimeMigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        with self.engine.begin() as connection:
            connection.execute(Invoice.__table__.insert().values(id=1, code="UNCHANGED", sold_at=datetime(2026, 10, 11, 0, 30)))
            connection.execute(InvoiceHistory.__table__.insert().values(
                invoice_id=1, action=InvoiceHistoryAction.created,
                after_data={"sold_at": "2026-10-11T00:30:00", "audited_at": "2026-10-10T18:00:00", "total_amount": "100"},
            ))

    def tearDown(self):
        self.engine.dispose()

    def test_conversion_is_idempotent_and_preserves_history_and_metadata(self):
        with self.engine.begin() as connection:
            before = connection.execute(select(Invoice.updated_at)).scalar()
            self.assertTrue(migrate_sale_times(connection))
            self.assertFalse(migrate_sale_times(connection))
            row = connection.execute(select(Invoice.code, Invoice.sold_at, Invoice.updated_at)).one()
            self.assertEqual(row.code, "UNCHANGED")
            self.assertEqual(row.sold_at, datetime(2026, 10, 10, 17, 30))
            self.assertEqual(row.updated_at, before)
            history = connection.execute(select(InvoiceHistory.after_data)).scalar()
            self.assertEqual(history["sold_at"], "2026-10-10T17:30:00Z")
            self.assertEqual(history["audited_at"], "2026-10-10T18:00:00Z")
            self.assertEqual(history["total_amount"], "100")
            backups = connection.execute(select(TimeNormalizationBackup.original_data)).scalars().all()
            self.assertEqual(len(backups), 2)
            self.assertEqual(backups[0]["sold_at"], "2026-10-11T00:30:00")

    def test_failed_conversion_rolls_back_records_backups_and_marker(self):
        with self.engine.begin() as connection:
            connection.execute(InvoiceHistory.__table__.update().values(after_data={"sold_at": "bad timestamp"}))
        with self.assertRaises(ValueError):
            with self.engine.begin() as connection:
                migrate_sale_times(connection)
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(select(Invoice.sold_at)).scalar(), datetime(2026, 10, 11, 0, 30))
            self.assertEqual(connection.execute(select(DataMigration.key)).all(), [])
            self.assertEqual(connection.execute(select(TimeNormalizationBackup.id)).all(), [])


if __name__ == "__main__":
    unittest.main()
