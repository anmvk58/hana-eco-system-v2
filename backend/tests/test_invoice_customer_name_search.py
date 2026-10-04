"""Invoice customer-name API filtering tests; isolated SQLite database."""
import os
import unittest
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.api.routers.invoices import router
from app.database import get_db
from app.models import Base, Customer, Invoice, Permission, Role, User
from app.models.enums import InvoiceStatus


class InvoiceCustomerNameSearchTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        an = Customer(code="AN", name="Nguyễn An Bình", phone="0901")
        lan = Customer(code="LAN", name="Mai", phone="0902")
        percent = Customer(code="PERCENT", name="100% An", phone="0903")
        self.db.add_all([an, lan, percent])
        self.db.flush()
        for index, customer, status, deleted in [(1, an, "created", False), (2, an, "completed", False), (3, an, "cancelled", False), (4, an, "created", True), (5, lan, "created", False), (6, percent, "created", False), (7, None, "created", False)]:
            self.db.add(Invoice(code=f"HD-261004-{index:03d}", customer=customer, status=InvoiceStatus(status), sold_at=datetime(2026, 10, 4, 10), deleted_at=datetime(2026, 10, 4, 11) if deleted else None))
        self.db.commit()
        self.user = User(username="test", display_name="Test", roles=[Role(name="Test", permissions=[Permission(code="invoices.view", name="Test", module="Test")])])
        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def search(self, **filters):
        response = self.client.get("/api/invoices", params=filters)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_partial_case_insensitive_name_and_whitespace(self):
        result = self.search(customer_name="  AN  ")
        self.assertEqual(result["total"], 4)
        self.assertTrue(all("An" in row["customer"]["name"] for row in result["items"]))
        self.assertEqual(self.search(customer_name="không tìm thấy")["total"], 0)
        self.assertEqual(self.search(customer_name="  ")["total"], 6)

    def test_name_combines_with_phone_code_status_and_dates(self):
        result = self.search(customer_name="An", customer_phone="0901", code="002", status="completed", from_date="2026-10-04", to_date="2026-10-04")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["code"], "HD-261004-002")
        self.assertEqual(self.search(customer_name="An", from_date="2026-10-05")["total"], 0)
        self.assertEqual(self.search(customer_name="An", customer_phone="0902")["total"], 0)

    def test_name_filter_counts_and_paginates_active_invoices(self):
        result = self.search(customer_name="An", exclude_cancelled=True, page_size=1, page=2)
        self.assertEqual((result["total"], result["page"], result["total_pages"]), (3, 2, 3))
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(self.search(customer_name="An", exclude_cancelled=True, page_size=1, page=99)["page"], 3)

    def test_literal_wildcards(self):
        result = self.search(customer_name="%")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["customer"]["name"], "100% An")
        self.assertEqual(self.search(customer_name="_")["total"], 0)

    def test_permissions_and_name_length(self):
        self.assertEqual(self.client.get("/api/invoices", params={"customer_name": "a" * 201}).status_code, 422)
        self.user.roles = []
        self.assertEqual(self.client.get("/api/invoices", params={"customer_name": "An"}).status_code, 403)


if __name__ == "__main__":
    unittest.main()
