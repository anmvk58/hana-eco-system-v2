import os
import unittest
from sqlalchemy import create_engine, insert, inspect, select, func
from sqlalchemy.orm import Session

os.environ["DATABASE_URL"] = "sqlite://"
from app.models import Base, Customer, Invoice
from app.models.customer import CustomerNameSearch
from app.services.customer_service import list_customers, list_customers_page
from app.services.search_index_service import ensure_search_indexes, QUERY_INDEXES
from app.customer_search import name_search_suffixes, normalized_customer_name


class SearchIndexTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_legacy_backfill_and_indexes_are_repeat_safe(self):
        with self.engine.begin() as connection:
            connection.execute(insert(Customer).values(code="C", name="Nguyễn Thị Lan"))
        for index in Invoice.__table__.indexes:
            if index.name in QUERY_INDEXES:
                index.drop(self.engine)
        ensure_search_indexes(self.engine)
        with self.engine.connect() as connection:
            count = connection.scalar(select(func.count()).select_from(CustomerNameSearch))
        ensure_search_indexes(self.engine)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(CustomerNameSearch)), count)
            self.assertEqual([row.code for row in list_customers(db, "Lan")], ["C"])
        self.assertTrue(QUERY_INDEXES.issubset({index["name"] for index in inspect(self.engine).get_indexes("invoices")}))

    def test_rename_soft_delete_and_rollback_sync_in_same_transaction(self):
        with Session(self.engine) as db:
            customer = Customer(code="C", name="Anna banana")
            db.add(customer); db.commit()
            self.assertEqual(list_customers_page(db, "an")["total"], 1)
            customer.name = "New person"; db.commit()
            self.assertEqual(list_customers(db, "banana"), [])
            self.assertEqual(len(list_customers(db, "person")), 1)
            customer.name = "Rollback name"; db.flush(); db.rollback()
            self.assertEqual(len(list_customers(db, "person")), 1)
            from datetime import datetime
            customer.deleted_at = datetime(2026, 10, 16); db.commit()
            self.assertEqual(list_customers(db, "person"), [])
            self.assertEqual(len(list_customers(db, "person", include_deleted=True)), 1)

    def test_normalization_and_suffixes(self):
        self.assertEqual(normalized_customer_name("ĐẶNG Thị LAN"), "dang thi lan")
        self.assertIn("lan", name_search_suffixes("Nguyễn Thị Lan"))
        self.assertEqual(name_search_suffixes("a"), set())

    def test_bulk_import_maintains_name_index_in_its_transaction(self):
        from pathlib import Path
        from unittest.mock import patch
        from init_data import import_customers as importer
        row = importer.CustomerImportRow(excel_row=2, code="01234", name="Bulk Lan", phone="0912345678", address="Address")
        config = importer.MySQLConfig(host="unused", port=3306, username="unused", password="unused", database="unused")
        with patch.object(importer, "read_customer_rows", return_value=[row]), \
             patch.object(importer, "create_mysql_engine", return_value=self.engine), \
             patch.object(self.engine, "dispose"), patch("builtins.print"):
            self.assertEqual(importer.import_customers(excel_file=Path("unused.xlsx"), mysql_config=config, target_table_name="customers"), 1)
        with Session(self.engine) as db:
            self.assertEqual([row.name for row in list_customers(db, "Lan")], ["Bulk Lan"])
