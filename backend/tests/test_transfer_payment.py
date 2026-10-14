"""Payment confirmation rules, using an isolated database."""
import os
import unittest
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.models import Base, Invoice, InvoiceHistory, InvoiceItem, Product, User
from app.models import InternalCodCollectionItem, RetailInvoiceCollection
from app.models.enums import InvoiceAuditLabel, InvoiceStatus
from app.schemas.invoice import InvoiceTransferConfirm
from app.services.invoice_service import confirm_transfer
from app.services.internal_cod_collection_service import pending_invoice_query
from app.api.deps import require_any_permission


class TransferPaymentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.actor = User(username="cashier", display_name="Thu ngân")
        self.product = Product(code="P1", name="Sản phẩm", unit="cái", stock_quantity=8)
        self.invoice = Invoice(code="HD-261009-001", status=InvoiceStatus.completed,
                               total_amount=100, subtotal=100,
                               audit_label=InvoiceAuditLabel.internal_shipper,
                               assigned_shipper_id=1, audited_at=datetime.utcnow(),
                               delivered_at=datetime.utcnow())
        self.invoice.items.append(InvoiceItem(product=self.product, product_code="P1",
                                             product_name="Sản phẩm", unit="cái",
                                             quantity=2, unit_price=50, line_total=100))
        self.db.add_all([self.actor, self.invoice])
        self.db.commit()
        self.id = self.invoice.id
        self.payload = InvoiceTransferConfirm(expected_total_amount=100, expected_revision=0, note="GD123")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_completed_order_removes_cod_and_preserves_stock_items_totals(self):
        self.assertEqual(len(self.db.scalars(pending_invoice_query()).all()), 1)
        updated = confirm_transfer(self.db, self.id, self.payload, self.actor)
        self.assertTrue(updated.is_paid_by_transfer)
        self.assertEqual(updated.status, InvoiceStatus.completed)
        self.assertEqual(updated.total_amount, Decimal("100"))
        self.assertEqual(updated.items[0].quantity, Decimal("2"))
        self.assertEqual(self.product.stock_quantity, Decimal("8"))
        self.assertEqual(self.db.scalars(pending_invoice_query()).all(), [])
        history = self.db.scalar(select(InvoiceHistory))
        self.assertEqual(history.changed_by_user_id, self.actor.id)
        self.assertFalse(history.before_data["is_paid_by_transfer"])
        self.assertTrue(history.after_data["is_paid_by_transfer"])
        self.assertIn("GD123", history.reason)
        confirm_transfer(self.db, self.id, self.payload, self.actor)
        self.assertEqual(len(self.db.scalars(select(InvoiceHistory)).all()), 1)

    def assert_blocked(self, expected=409):
        with self.assertRaises(HTTPException) as context:
            confirm_transfer(self.db, self.id, self.payload, self.actor)
        self.assertEqual(context.exception.status_code, expected)
        self.assertFalse(self.db.get(Invoice, self.id).is_paid_by_transfer)
        self.assertEqual(self.db.scalars(select(InvoiceHistory)).all(), [])

    def test_stale_amount(self):
        self.payload.expected_total_amount = Decimal("99")
        self.assert_blocked()

    def test_stale_revision(self):
        self.payload.expected_revision = 1
        self.assert_blocked()

    def test_cancelled(self):
        self.invoice.status = InvoiceStatus.cancelled
        self.db.commit()
        self.assert_blocked()

    def test_deleted(self):
        self.invoice.deleted_at = datetime.utcnow()
        self.db.commit()
        with self.assertRaises(HTTPException) as context:
            confirm_transfer(self.db, self.id, self.payload, self.actor)
        self.assertEqual(context.exception.status_code, 404)

    def test_collected_cod(self):
        self.db.add(InternalCodCollectionItem(session_id=1, invoice_id=self.id,
                                              invoice_code=self.invoice.code, cod_amount=100))
        self.db.commit()
        self.assert_blocked()

    def test_reconciled(self):
        self.db.add(RetailInvoiceCollection(invoice_id=self.id, invoice_code=self.invoice.code,
                                            collected_amount=100))
        self.db.commit()
        self.assert_blocked()

    def test_external_handover(self):
        self.invoice.audit_label = InvoiceAuditLabel.external_shipper
        self.db.commit()
        self.assert_blocked()

    def test_transaction_failure_rolls_back(self):
        with patch("app.services.invoice_service.add_history", side_effect=RuntimeError("failure")):
            with self.assertRaises(RuntimeError):
                confirm_transfer(self.db, self.id, self.payload, self.actor)
        self.assertFalse(self.db.get(Invoice, self.id).is_paid_by_transfer)
        self.assertEqual(self.db.get(Invoice, self.id).revision, 0)

    def test_permission_denied_without_staff_permissions(self):
        with self.assertRaises(HTTPException) as context:
            require_any_permission("invoices.update", "order_reconciliation.manage")(self.actor)
        self.assertEqual(context.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
