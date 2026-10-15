"""Customer lookup and compatibility index regression checks."""
import os
import unittest
from datetime import datetime
from unittest.mock import patch
from types import SimpleNamespace

os.environ["DATABASE_URL"] = "sqlite://"

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models import Base, Customer
from app.api.deps import get_current_user
from app.api.routers.customers import router
from app.database import get_db
from app.main import ensure_customer_name_index
from app.services.customer_service import list_customers, list_customers_page


class CustomerSearchTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([
            Customer(code="C1", name="Nguyễn Thị Lan", phone="0912345678"),
            Customer(code="C2", name="Lan Anh", phone=None),
            Customer(code="C3", name="Khách khác", phone="0912399999"),
            Customer(code="C4", name="Lan đã xóa", phone="0912388888", deleted_at=datetime(2026, 1, 1)),
            Customer(code="C5", name="Khách 100%", phone=None),
            Customer(code="C6", name="Khách_A", phone=None),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def codes(self, **kwargs):
        return {row.code for row in list_customers(self.db, **kwargs)}

    def test_name_fragment_and_customer_without_phone(self):
        self.assertEqual(self.codes(search="  Lan  "), {"C1", "C2"})
        self.assertEqual(self.codes(search="Nguyễn   Thị"), {"C1"})
        self.assertEqual(self.codes(search="lan"), {"C1", "C2"})

    def test_phone_prefix_preserves_space_normalization(self):
        self.assertEqual(self.codes(search="091 23"), {"C1", "C3"})
        self.assertEqual(self.codes(search="12345"), set())

    def test_like_metacharacters_are_literal(self):
        self.assertEqual(self.codes(search="%"), {"C5"})
        self.assertEqual(self.codes(search="_"), {"C6"})

    def test_filter_precedes_pagination_and_page_count_agrees(self):
        full = list_customers(self.db, search="Lan")
        page = list_customers_page(self.db, search="Lan", skip=1, limit=1)
        self.assertEqual(page["total"], 2)
        self.assertEqual([row.id for row in page["items"]], [full[1].id])
        self.assertEqual([row.id for row in list_customers(self.db, search="Lan", skip=1, limit=1)], [full[1].id])

    def test_deleted_and_empty_search(self):
        self.assertEqual(len(self.codes(search="  ")), 5)
        self.assertEqual(self.codes(search="Lan", include_deleted=True), {"C1", "C2", "C4"})

    def test_name_index_repaired_and_repeat_is_safe(self):
        with self.engine.begin() as connection:
            connection.execute(text("DROP INDEX ix_customers_name"))
        with patch("app.main.engine", self.engine):
            ensure_customer_name_index()
            ensure_customer_name_index()
        indexes = inspect(self.engine).get_indexes("customers")
        self.assertEqual(sum(index["column_names"] == ["name"] for index in indexes), 1)

    def test_api_permissions_and_both_search_endpoints(self):
        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: self.db
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/customers", params={"search": "Lan"}).status_code, 401)
            user = SimpleNamespace(roles=[])
            app.dependency_overrides[get_current_user] = lambda: user
            self.assertEqual(client.get("/api/customers", params={"search": "Lan"}).status_code, 403)
            user.roles = [SimpleNamespace(permissions=[SimpleNamespace(code="invoices.create")])]
            response = client.get("/api/customers", params={"search": "Lan", "skip": 0, "limit": 20})
            self.assertEqual(response.status_code, 200)
            self.assertEqual({row["code"] for row in response.json()}, {"C1", "C2"})
            self.assertEqual(client.get("/api/customers/page").status_code, 403)
            user.roles = [SimpleNamespace(permissions=[SimpleNamespace(code="customers.view")])]
            response = client.get("/api/customers/page", params={"search": "Lan", "skip": 1, "limit": 1})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["total"], 2)
            self.assertEqual(len(response.json()["items"]), 1)


if __name__ == "__main__":
    unittest.main()
