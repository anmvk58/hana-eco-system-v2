"""Run from backend: python -m unittest discover -s tests -v.
Uses an isolated SQLite database; never connects to the configured application DB.
"""
import os
import unittest
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models import Base, Invoice, InvoiceHistory, User
from app.models.enums import InvoiceAuditLabel
from app.schemas.invoice import InvoiceBulkAuditAssign, InvoiceRead
from app.services import invoice_service, order_reconciliation_service, ship_management_service


class RetailHandoverNoteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.user = User(username="tester", display_name="Người kiểm thử")
        self.invoices = [Invoice(code=f"HD-261004-{index:03d}", note="Ghi chú bán hàng", total_amount=100000, subtotal=100000) for index in (1, 2)]
        self.db.add_all([self.user, *self.invoices])
        self.db.commit()
        self.ids = [invoice.id for invoice in self.invoices]

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def payload(self, **changes):
        return InvoiceBulkAuditAssign(invoice_ids=self.ids, audit_label="retail", **changes)

    def test_note_persists_for_every_selected_invoice_and_reconciliation(self):
        invoices = ship_management_service.handover_invoices(self.db, self.payload(handover_note="  Thu tại quầy\nKhách tự lấy  "), self.user)
        for invoice in invoices:
            self.assertEqual(invoice.handover_note, "Thu tại quầy\nKhách tự lấy")
            self.assertEqual(invoice.note, "Ghi chú bán hàng")
            self.assertEqual(invoice.total_amount, 100000)
            self.assertEqual(InvoiceRead.model_validate(invoice).handover_note, invoice.handover_note)
        rows = order_reconciliation_service.list_retail_invoices(self.db)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["invoice"].handover_note == invoices[0].handover_note for row in rows))
        histories = self.db.scalars(select(InvoiceHistory)).all()
        self.assertEqual(len(histories), 2)
        for history in histories:
            self.assertIsNone(history.before_data["handover_note"])
            self.assertEqual(history.after_data["handover_note"], invoices[0].handover_note)

    def test_optional_or_blank_note(self):
        self.assertIsNone(self.payload().handover_note)
        invoices = ship_management_service.handover_invoices(self.db, self.payload(handover_note="  \n "), self.user)
        self.assertTrue(all(invoice.handover_note is None for invoice in invoices))

    def test_note_length_and_non_retail_validation(self):
        with self.assertRaises(ValidationError):
            self.payload(handover_note="a" * 501)
        self.assertEqual(len(self.payload(handover_note="a" * 500).handover_note), 500)
        with self.assertRaises(ValidationError):
            InvoiceBulkAuditAssign(invoice_ids=self.ids, audit_label="external_shipper", handover_note="Không hợp lệ", external_handoff={"advance_method": "transfer", "transfer_amount": "200000", "cash_amount": "0", "shipping_fee": "0"})

    def test_rollback_clears_note_and_preserves_history(self):
        ship_management_service.handover_invoices(self.db, self.payload(handover_note="Khách tự lấy"), self.user)
        invoice = invoice_service.rollback_audit_label(self.db, self.ids[0], "Bàn giao nhầm", self.user)
        self.assertIsNone(invoice.handover_note)
        self.assertIsNone(invoice.audit_label)
        history = self.db.scalars(select(InvoiceHistory).where(InvoiceHistory.invoice_id == invoice.id).order_by(InvoiceHistory.id.desc())).first()
        self.assertEqual(history.before_data["handover_note"], "Khách tự lấy")
        self.assertIsNone(history.after_data["handover_note"])
        new_payload = InvoiceBulkAuditAssign(invoice_ids=[invoice.id], audit_label="retail")
        self.assertIsNone(ship_management_service.handover_invoices(self.db, new_payload, self.user)[0].handover_note)

    def test_conflicting_batch_does_not_partially_assign_note(self):
        self.invoices[1].audit_label = InvoiceAuditLabel.retail
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            ship_management_service.handover_invoices(self.db, self.payload(handover_note="Không lưu"), self.user)
        self.assertEqual(caught.exception.status_code, 409)
        self.db.refresh(self.invoices[0])
        self.assertIsNone(self.invoices[0].audit_label)
        self.assertIsNone(self.invoices[0].handover_note)
        self.assertEqual(self.db.scalars(select(InvoiceHistory)).all(), [])

    def test_history_failure_rolls_back_whole_batch(self):
        original = ship_management_service.add_invoice_history
        calls = 0
        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("Simulated history failure")
            return original(*args, **kwargs)
        with patch.object(ship_management_service, "add_invoice_history", side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                ship_management_service.handover_invoices(self.db, self.payload(handover_note="Không lưu"), self.user)
        for invoice in self.invoices:
            self.db.refresh(invoice)
            self.assertIsNone(invoice.audit_label)
            self.assertIsNone(invoice.handover_note)
        self.assertEqual(self.db.scalars(select(InvoiceHistory)).all(), [])


if __name__ == "__main__":
    unittest.main()
