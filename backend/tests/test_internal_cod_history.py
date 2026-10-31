"""Collection history snapshots, using an isolated SQLite database."""
import os
import unittest
from datetime import date, datetime
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite://"

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base, Customer, Invoice, Shipper, User
from app.models.enums import InvoiceAuditLabel
from app.schemas.internal_cod_collection import InternalCodCollectionCreate, InternalCodCollectionSessionRead
from app.services.internal_cod_collection_service import create_session, get_session, list_sessions


class InternalCodHistoryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.user = User(username="collector", display_name="Thu ngân")
        self.shipper = Shipper(user=self.user)
        self.customer = Customer(code="KH1", name="Khách hàng", address="12 Nguyễn Huệ")
        self.invoice = Invoice(code="HD-261031-001", customer=self.customer,
                               assigned_shipper=self.shipper, audit_label=InvoiceAuditLabel.internal_shipper,
                               audited_at=datetime(2026, 10, 31, 3), total_amount=150000,
                               subtotal=140000, total_extra_charges=10000)
        self.db.add(self.invoice)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def collect(self, expression=None):
        return create_session(self.db, InternalCodCollectionCreate(
            shipper_id=self.shipper.id, collection_date=date(2026, 10, 31),
            invoice_ids=[self.invoice.id], amount_expression=expression,
        ), self.user)

    def test_history_preserves_collection_values_after_source_changes(self):
        session = self.collect("  100000 + 50000  ")
        self.customer.address = "Địa chỉ mới"
        self.invoice.total_extra_charges = 20000
        self.db.commit()
        self.db.expire_all()
        for data in [get_session(self.db, session["id"]), *list_sessions(self.db, None, None, None)]:
            result = InternalCodCollectionSessionRead.model_validate(data)
            self.assertEqual(result.amount_expression, "100000 + 50000")
            self.assertEqual(result.items[0].customer_address, "12 Nguyễn Huệ")
            self.assertEqual(result.items[0].total_extra_charges, Decimal("10000"))
            self.assertEqual(result.total_amount, Decimal("150000"))

    def test_expression_is_optional_and_does_not_change_collected_amount(self):
        result = InternalCodCollectionSessionRead.model_validate(self.collect("  "))
        self.assertIsNone(result.amount_expression)
        self.assertEqual(result.total_amount, Decimal("150000"))

    def test_expression_is_informational(self):
        result = InternalCodCollectionSessionRead.model_validate(self.collect("1 + 2"))
        self.assertEqual(result.amount_expression, "1 + 2")
        self.assertEqual(result.total_amount, Decimal("150000"))
