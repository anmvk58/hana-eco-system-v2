"""Content mutations must preserve settled money and invoice history."""
import os
import unittest
from datetime import datetime
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite://"
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from app.models import Base, Invoice, InvoiceHistory, InvoiceItem, Product, RetailInvoiceCollection, InternalCodCollectionItem
from app.models.enums import InvoiceAuditLabel, InvoiceStatus
from app.schemas.invoice import InvoiceUpdate, InvoiceItemCreate
from app.services import invoice_service
from app.models.external_handover import ExternalHandoverBatch, ExternalHandoverBatchItem
from app.models.external_handover_reconciliation import ExternalHandoverBatchReconciliation
from app.models.enums import ExternalAdvanceMethod


class SettledInvoiceGuardsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.product = Product(code="P", name="Product", unit="kg", stock_quantity=9, sale_price=100)
        self.invoice = Invoice(code="I", status=InvoiceStatus.created, sold_at=datetime(2026, 10, 16),
                               subtotal=100, total_amount=100, audit_label=InvoiceAuditLabel.retail)
        self.invoice.items = [InvoiceItem(product=self.product, product_code="P", product_name="Product", unit="kg", quantity=1, unit_price=100, line_total=100)]
        self.db.add(self.invoice)
        self.db.commit()
        self.invoice_id, self.product_id = self.invoice.id, self.product.id

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def update(self):
        return invoice_service.update_invoice(self.db, self.invoice_id,
            InvoiceUpdate(customer_id=None, items=[InvoiceItemCreate(product_id=self.product_id, quantity=2, unit_price=100)]), None, "Test")

    def cancel(self):
        return invoice_service.cancel_invoice(self.db, self.invoice_id, None, "Test", "Test cancellation")

    def delete(self):
        return invoice_service.soft_delete_invoice(self.db, self.invoice_id, None, "Test")

    def assert_all_blocked(self):
        before = invoice_service.snapshot_invoice(self.invoice)
        for action in (self.update, self.cancel, self.delete):
            with self.subTest(action=action.__name__):
                with self.assertRaises(HTTPException) as error:
                    action()
                self.assertEqual(error.exception.status_code, 409)
                self.db.rollback()
                self.assertEqual(invoice_service.snapshot_invoice(self.db.get(Invoice, self.invoice_id)), before)
                self.assertEqual(self.db.get(Product, self.product_id).stock_quantity, Decimal("9"))
                self.assertEqual(self.db.scalar(select(func.count()).select_from(InvoiceHistory)), 0)

    def test_retail_collection_blocks_all_mutations(self):
        self.db.add(RetailInvoiceCollection(invoice_id=self.invoice_id, invoice_code="I", collected_amount=100))
        self.db.commit()
        self.assert_all_blocked()

    def test_cod_collection_blocks_all_mutations(self):
        self.db.add(InternalCodCollectionItem(session_id=1, invoice_id=self.invoice_id, invoice_code="I", cod_amount=100))
        self.db.commit()
        self.assert_all_blocked()

    def test_external_handover_blocks_direct_mutations(self):
        self.invoice.audit_label = InvoiceAuditLabel.external_shipper
        self.db.commit()
        self.assert_all_blocked()

    def test_active_external_membership_blocks_even_when_label_is_inconsistent(self):
        self.invoice.audit_label = None
        batch = ExternalHandoverBatch(code="B", advance_method=ExternalAdvanceMethod.cash,
                                     cash_amount=100, advance_amount=100)
        batch.items = [ExternalHandoverBatchItem(invoice_id=self.invoice_id)]
        batch.reconciliation = ExternalHandoverBatchReconciliation(batch_code="B", invoice_count=1,
            expected_amount=100, received_amount=100, advance_method=ExternalAdvanceMethod.cash)
        self.db.add(batch); self.db.commit()
        self.assert_all_blocked()

    def test_unsettled_retail_can_edit_then_cancel_with_stock_and_history(self):
        updated = self.update()
        self.assertEqual(updated.total_amount, Decimal("200"))
        self.assertEqual(self.db.get(Product, self.product_id).stock_quantity, Decimal("8"))
        self.cancel()
        self.assertEqual(self.db.get(Product, self.product_id).stock_quantity, Decimal("10"))
        self.assertEqual(self.db.scalar(select(func.count()).select_from(InvoiceHistory)), 2)

    def test_unsettled_delete_still_restores_stock_once(self):
        self.delete()
        self.assertEqual(self.db.get(Product, self.product_id).stock_quantity, Decimal("10"))
        with self.assertRaises(HTTPException):
            self.delete()
        self.assertEqual(self.db.get(Product, self.product_id).stock_quantity, Decimal("10"))
