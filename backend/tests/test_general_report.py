import os
import unittest
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

os.environ["DATABASE_URL"] = "sqlite://"
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.models import Base, Invoice, InvoiceItem, InvoiceExtraCharge
from app.models.enums import ExtraChargeType, InvoiceStatus
from app.services.report_service import general_report
from app.api.routers.reports import router
from app.api.deps import get_current_user
from app.database import get_db
from app.schemas.report import GeneralReportRead


class GeneralReportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        for index, (sold, status) in enumerate([
            (datetime(2026, 10, 15, 16, 59, 59), InvoiceStatus.created),
            (datetime(2026, 10, 15, 17), InvoiceStatus.created),
            (datetime(2026, 10, 16, 16, 59, 59), InvoiceStatus.completed),
            (datetime(2026, 10, 16, 17), InvoiceStatus.created),
            (datetime(2026, 10, 16, 8), InvoiceStatus.cancelled),
            (datetime(2026, 10, 16, 9), InvoiceStatus.created),
        ]):
            invoice = Invoice(code=f"I{index}", sold_at=sold, status=status, subtotal=150,
                              total_amount=Decimal("158.50"), total_extra_charges=Decimal("18.50"), discount_amount=10,
                              created_at=datetime(2026, 10, 16, index))
            invoice.items = [InvoiceItem(product_code="P", product_name=f"Snapshot {index}", unit="kg", quantity=1, unit_price=100, line_total=100),
                             InvoiceItem(product_code="Q", product_name="Other", unit="kg", quantity=Decimal("0.5"), unit_price=100, line_total=50)]
            invoice.extra_charges = [InvoiceExtraCharge(charge_type=ExtraChargeType.shipping, name="Ship", amount=Decimal("12.50")),
                                     InvoiceExtraCharge(charge_type=ExtraChargeType.shipping, name="Ship2", amount=1),
                                     InvoiceExtraCharge(charge_type=ExtraChargeType.other, name="Other", amount=5)]
            if index == 5:
                invoice.deleted_at = datetime(2026, 10, 16, 10)
            self.db.add(invoice)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_totals_do_not_multiply_with_multiple_items_and_charges(self):
        result = GeneralReportRead.model_validate(general_report(self.db, date(2026, 10, 16), date(2026, 10, 16)))
        self.assertEqual(result.summary.revenue, Decimal("317"))
        self.assertEqual(result.summary.subtotal, Decimal("300"))
        self.assertEqual(result.summary.shipping, Decimal("27"))
        self.assertEqual(result.summary.discount, Decimal("20"))
        self.assertEqual([(row.key, row.quantity, row.revenue) for row in result.products], [("P", 2, 200), ("Q", 1, 100)])
        self.assertEqual(result.products[0].name, "Snapshot 2")
        self.assertEqual([(row.day, row.revenue) for row in result.days], [("2026-10-16", Decimal("317"))])

    def test_unbounded_open_ranges_and_empty_results(self):
        self.assertEqual(general_report(self.db, None, None)["summary"]["revenue"], Decimal("634"))
        self.assertEqual(general_report(self.db, date(2026, 10, 17), None)["summary"]["revenue"], Decimal("158.50"))
        self.assertEqual(general_report(self.db, None, date(2026, 10, 15))["summary"]["revenue"], Decimal("158.50"))
        empty = general_report(self.db, date(2020, 1, 1), date(2020, 1, 1))
        self.assertTrue(all(value == 0 for value in empty["summary"].values()))
        self.assertEqual(empty["products"], [])
        self.assertEqual(empty["days"], [])

    def test_query_count_is_fixed(self):
        statements = []
        def record(*args):
            statements.append(args[2])
        event.listen(self.engine, "before_cursor_execute", record)
        try:
            general_report(self.db, None, None)
        finally:
            event.remove(self.engine, "before_cursor_execute", record)
        self.assertEqual(len(statements), 4)

    def test_invalid_range(self):
        with self.assertRaises(HTTPException) as error:
            general_report(self.db, date(2026, 10, 17), date(2026, 10, 16))
        self.assertEqual(error.exception.status_code, 422)

    def test_endpoint_permissions_and_decimal_serialization(self):
        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: self.db
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/reports/summary").status_code, 401)
            user = SimpleNamespace(roles=[])
            app.dependency_overrides[get_current_user] = lambda: user
            self.assertEqual(client.get("/api/reports/summary").status_code, 403)
            user.roles = [SimpleNamespace(permissions=[SimpleNamespace(code="reports.view")])]
            response = client.get("/api/reports/summary", params={"from_date": "2026-10-16", "to_date": "2026-10-16"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(Decimal(response.json()["summary"]["revenue"]), Decimal("317"))
            self.assertNotIn("items", response.json())
