"""Supplier ledger API invariants with an isolated database and real RBAC."""
import os
import unittest
from decimal import Decimal
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.api.routers.supplier_debts import router
from app.database import get_db
from app.models import Base, Permission, Product, Role, User
from app.models.supplier_debt import SupplierDebtEntry, SupplierDebtHistory, SupplierDebtPayment


class SupplierDebtTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        @event.listens_for(self.engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        self.permissions = {suffix: Permission(code=f"supplier_debts.{suffix}", name=suffix, module="Công nợ") for suffix in ("view", "manage", "pay")}
        self.role = Role(name="Ledger", permissions=list(self.permissions.values()))
        self.user = User(username="ledger", display_name="Kế toán", roles=[self.role])
        self.product = Product(code="UNCHANGED", name="Hàng kho", unit="kg", stock_quantity=9, sale_price=100, cost_price=50)
        self.db.add_all([self.user, self.product]); self.db.commit()
        self.product_id = self.product.id
        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)
        self.supplier = self.post("suppliers", {"name": "Vườn A"})

    def tearDown(self):
        self.db.rollback()
        product = self.db.get(Product, self.product_id)
        self.assertEqual(product.stock_quantity, Decimal("9"))
        self.assertEqual(product.cost_price, Decimal("50"))
        self.client.close(); self.db.close(); self.engine.dispose()

    def post(self, path, payload, status=201):
        response = self.client.post(f"/api/supplier-debts/{path}", json=payload)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def purchase(self, quantity="10", price="200000", **extra):
        return self.post("entries", dict(supplier_id=self.supplier["id"], kind="purchase", entry_date="2026-10-19", description="Nhập trái cây",
            items=[dict(name="Tên tự do không có trong kho", quantity=quantity, unit_price=price)], **extra))

    def adjustment(self, kind, amount, supplier_id=None):
        return self.post("entries", dict(supplier_id=supplier_id or self.supplier["id"], kind=kind, entry_date="2026-10-19", description="Phí ship / trả hàng", amount=amount))

    def balance(self):
        response = self.client.get("/api/supplier-debts/suppliers")
        self.assertEqual(response.status_code, 200, response.text)
        return next(s for s in response.json() if s["id"] == self.supplier["id"])

    def pay_payload(self, entries, amount):
        return dict(supplier_id=self.supplier["id"], entries=[dict(id=e["id"], revision=e["revision"]) for e in entries], expected_amount=amount, paid_on="2026-10-19", method="transfer", note="Đã chuyển khoản")

    def update(self, entry, **changes):
        fields = ("supplier_id", "kind", "entry_date", "description", "note", "amount")
        payload = {field: entry[field] for field in fields}
        payload["items"] = [{field: item[field] for field in ("name", "quantity", "unit_price")} for item in entry["items"]]
        return self.client.put(f'/api/supplier-debts/entries/{entry["id"]}', json={**payload, "expected_revision": entry["revision"], **changes})

    def test_purchase_adjustments_settlement_and_undo(self):
        entry = self.purchase()
        increase = self.adjustment("increase", "80000")
        decrease = self.adjustment("decrease", "200000")
        self.assertEqual(Decimal(self.balance()["outstanding_amount"]), Decimal("1880000"))
        self.assertEqual(self.balance()["pending_count"], 3)
        payment = self.post("payments", self.pay_payload([entry, increase, decrease], "1880000"))
        self.assertEqual(len(payment["entries"]), 3)
        self.assertEqual(Decimal(self.balance()["outstanding_amount"]), 0)
        self.assertEqual(self.balance()["pending_count"], 0)
        paid = self.client.get(f'/api/supplier-debts/entries?supplier_id={self.supplier["id"]}&state=paid').json()
        self.assertEqual(paid["total"], 3)
        self.assertEqual(self.update(entry).status_code, 409)
        self.post(f'entries/{entry["id"]}/cancel', {"reason": "Sai phiếu", "expected_revision": 0}, 409)
        self.post("payments", self.pay_payload([entry], "2000000"), 409)
        self.post(f'payments/{payment["id"]}/undo', {"reason": "Xác nhận nhầm"}, 200)
        self.assertEqual(Decimal(self.balance()["outstanding_amount"]), Decimal("1880000"))
        self.post(f'payments/{payment["id"]}/undo', {"reason": "Lặp lại"}, 409)
        # Old selection is stale even after undo: cannot accidentally settle twice.
        self.post("payments", self.pay_payload([entry], "2000000"), 409)

    def test_decimal_rounding_uses_server_totals(self):
        entry = self.purchase(quantity="0.001", price="5", amount="999999")
        self.assertEqual(Decimal(entry["amount"]), Decimal("0.01"))
        self.assertEqual(Decimal(entry["items"][0]["line_total"]), Decimal("0.01"))
        self.assertEqual(entry["items"][0]["name"], "Tên tự do không có trong kho")

    def test_edit_cancel_and_stale_revision(self):
        entry = self.purchase()
        response = self.update(entry, items=[dict(name="Hàng khác", quantity="2.5", unit_price="10000")])
        self.assertEqual(response.status_code, 200, response.text)
        updated = response.json()
        self.assertEqual(Decimal(updated["amount"]), Decimal("25000"))
        self.assertEqual(self.update(entry).status_code, 409)
        self.post(f'entries/{entry["id"]}/cancel', {"reason": "Sai", "expected_revision": 0}, 409)
        self.post(f'entries/{entry["id"]}/cancel', {"reason": "Hủy nhập nhầm", "expected_revision": 1}, 200)
        self.assertEqual(self.balance()["pending_count"], 0)
        self.assertEqual(self.update(updated).status_code, 409)
        audit = self.client.get(f'/api/supplier-debts/history?supplier_id={self.supplier["id"]}&entry_id={entry["id"]}').json()
        self.assertEqual([e["action"] for e in audit], ["entry_cancel", "entry_update", "entry_create"])
        self.assertEqual(audit[1]["details"]["before"]["items"][0]["quantity"], "10.000")

    def test_wrong_supplier_and_mixed_stale_selection_roll_back_everything(self):
        other = self.post("suppliers", {"name": "Vườn B"})
        entry = self.purchase()
        foreign = self.adjustment("increase", "100", other["id"])
        self.post("payments", self.pay_payload([entry, foreign], "2000100"), 409)
        second = self.adjustment("increase", "50")
        response = self.update(second, amount="60")
        self.assertEqual(response.status_code, 200)
        before = self.db.scalar(select(func.count()).select_from(SupplierDebtHistory))
        self.post("payments", self.pay_payload([entry, second], "2000050"), 409)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(SupplierDebtPayment)), 0)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(SupplierDebtHistory)), before)
        self.assertIsNone(self.db.get(SupplierDebtEntry, entry["id"]).payment_id)

    def test_payment_amount_mismatch_duplicates_and_negative_net(self):
        entry = self.purchase()
        self.post("payments", self.pay_payload([entry], "1"), 409)
        self.post("payments", self.pay_payload([entry, entry], "4000000"), 422)
        decrease = self.adjustment("decrease", "10")
        self.post("payments", self.pay_payload([decrease], "0"), 422)
        self.assertEqual(self.balance()["pending_count"], 2)

    def test_zero_net_settlement_and_credit_balance(self):
        decrease = self.adjustment("decrease", "100")
        self.assertEqual(Decimal(self.balance()["outstanding_amount"]), -100)
        increase = self.adjustment("increase", "100")
        self.post("payments", self.pay_payload([decrease, increase], "0"))
        self.assertEqual(self.balance()["pending_count"], 0)

    def test_snapshot_survives_undo_edit_and_resettlement(self):
        entry = self.purchase()
        payment = self.post("payments", self.pay_payload([entry], "2000000"))
        self.post(f'payments/{payment["id"]}/undo', {"reason": "Sửa số liệu"}, 200)
        current = self.client.get(f'/api/supplier-debts/entries?supplier_id={self.supplier["id"]}').json()["items"][0]
        self.assertEqual(self.update(current, items=[dict(name="Hàng sửa", quantity="1", unit_price="10")]).status_code, 200)
        current = self.client.get(f'/api/supplier-debts/entries?supplier_id={self.supplier["id"]}').json()["items"][0]
        self.post("payments", self.pay_payload([current], "10"))
        original = self.client.get(f'/api/supplier-debts/payments?supplier_id={self.supplier["id"]}').json()["items"][1]
        self.assertEqual(original["entries"][0]["items"][0]["name"], "Tên tự do không có trong kho")
        self.assertEqual(Decimal(original["amount"]), Decimal("2000000"))
        audit = self.client.get(f'/api/supplier-debts/history?supplier_id={self.supplier["id"]}&entry_id={entry["id"]}').json()
        self.assertEqual(sum(item["action"] == "payment_create" for item in audit), 2)

    def test_supplier_configuration_and_inactive_settlement(self):
        self.post("suppliers", {"name": " vườn a "}, 409)
        self.post("suppliers", {"name": "   "}, 422)
        entry = self.purchase()
        response = self.client.put(f'/api/supplier-debts/suppliers/{self.supplier["id"]}', json={"name": "Vườn A đổi tên", "is_active": False})
        self.assertEqual(response.status_code, 200)
        self.post("entries", dict(supplier_id=self.supplier["id"], kind="increase", entry_date="2026-10-19", description="Mới", amount="10"), 409)
        self.post("payments", self.pay_payload([entry], "2000000"))
        self.assertEqual(self.balance()["pending_count"], 0)

    def test_input_bounds_and_pagination(self):
        for kind, amount in (("increase", "0"), ("decrease", "-1"), ("increase", "NaN"), ("increase", "1.001")):
            self.post("entries", dict(supplier_id=self.supplier["id"], kind=kind, entry_date="2026-10-19", description="Test", amount=amount), 422)
        self.post("entries", dict(supplier_id=self.supplier["id"], kind="purchase", entry_date="2026-10-19", description="Test", items=[]), 422)
        response = self.client.post("/api/supplier-debts/entries", json=dict(supplier_id=self.supplier["id"], kind="purchase", entry_date="2026-10-19", description="Test", items=[dict(name="To", quantity="100", unit_price="999999999999.99")]))
        self.assertEqual(response.status_code, 422)
        first = self.adjustment("increase", "1")
        second = self.adjustment("increase", "2")
        page = self.client.get(f'/api/supplier-debts/entries?supplier_id={self.supplier["id"]}&page_size=1&page=2').json()
        self.assertEqual(page["total"], 2)
        self.assertEqual(page["items"][0]["id"], first["id"])
        self.assertNotEqual(first["id"], second["id"])

    def test_backend_permissions_and_no_cross_module_permission_leak(self):
        entry = self.purchase()
        self.role.permissions = [self.permissions["view"]]; self.db.commit()
        self.assertEqual(self.client.get("/api/supplier-debts/suppliers").status_code, 200)
        self.post("suppliers", {"name": "Denied"}, 403)
        self.assertEqual(self.update(entry).status_code, 403)
        self.post(f'entries/{entry["id"]}/cancel', {"reason": "Denied"}, 403)
        self.post("payments", self.pay_payload([entry], "2000000"), 403)
        self.post("payments/1/undo", {"reason": "Denied"}, 403)
        self.role.permissions = []; self.db.commit()
        for path in ("suppliers", "entries", f'entries?supplier_id={self.supplier["id"]}', f'payments?supplier_id={self.supplier["id"]}', f'history?supplier_id={self.supplier["id"]}'):
            self.assertEqual(self.client.get(f"/api/supplier-debts/{path}").status_code, 403)

    def test_history_failure_rolls_back_entry_and_payment(self):
        from app.services import supplier_debt_service as service
        from app.schemas.supplier_debt import DebtEntryPayload, DebtPaymentPayload
        entry = self.purchase()
        before = self.db.scalar(select(func.count()).select_from(SupplierDebtHistory))
        with patch.object(service, "history", side_effect=RuntimeError("audit failed")):
            with self.assertRaises(RuntimeError):
                service.save_entry(self.db, DebtEntryPayload(supplier_id=self.supplier["id"], kind="increase", entry_date="2026-10-19", description="Rollback", amount="1"), self.user)
            with self.assertRaises(RuntimeError):
                service.create_payment(self.db, DebtPaymentPayload(**self.pay_payload([entry], "2000000")), self.user)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(SupplierDebtEntry)), 1)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(SupplierDebtPayment)), 0)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(SupplierDebtHistory)), before)
        self.assertEqual(Decimal(self.balance()["outstanding_amount"]), Decimal("2000000"))

    def test_manage_and_payment_permissions_are_independent(self):
        entry = self.purchase()
        self.role.permissions = [self.permissions["manage"]]; self.db.commit()
        self.assertEqual(self.update(entry).status_code, 200)
        self.post("payments", self.pay_payload([entry], "2000000"), 403)
        self.role.permissions = [self.permissions["view"], self.permissions["pay"]]; self.db.commit()
        self.assertEqual(self.update(entry).status_code, 403)
        current = self.client.get(f'/api/supplier-debts/entries?supplier_id={self.supplier["id"]}').json()["items"][0]
        self.post("payments", self.pay_payload([current], "2000000"))

    def test_date_range_totals_keep_current_balance_and_include_endpoints(self):
        def make(day, kind, amount):
            return self.post("entries", dict(supplier_id=self.supplier["id"], kind=kind, entry_date=day, description=day, amount=amount))
        make("2026-10-18", "increase", "100")
        first = make("2026-10-19", "increase", "80")
        make("2026-10-20", "decrease", "20")
        make("2026-10-21", "increase", "40")
        base = f'/api/supplier-debts/entries?supplier_id={self.supplier["id"]}'
        for dates, expected, count in (("from_date=2026-10-19&to_date=2026-10-20", 60, 2), ("to_date=2026-10-19", 180, 2), ("from_date=2026-10-20", 20, 2), ("", 200, 4)):
            response = self.client.get(f"/api/supplier-debts/suppliers?{dates}")
            self.assertEqual(response.status_code, 200, response.text)
            supplier = response.json()[0]
            self.assertEqual(Decimal(supplier["outstanding_amount"]), 200)
            self.assertEqual(Decimal(supplier["period_outstanding_amount"]), expected)
            self.assertEqual(supplier["period_pending_count"], count)
            self.assertEqual(self.client.get(f"{base}&{dates}").json()["total"], count)
        payload = self.pay_payload([first], "80")
        payload["paid_on"] = "2026-10-22"
        self.post("payments", payload)
        suppliers = self.client.get("/api/supplier-debts/suppliers?from_date=2026-10-19&to_date=2026-10-20").json()
        self.assertEqual(Decimal(suppliers[0]["outstanding_amount"]), 120)
        self.assertEqual(Decimal(suppliers[0]["period_outstanding_amount"]), -20)
        paid_base = f'/api/supplier-debts/payments?supplier_id={self.supplier["id"]}'
        self.assertEqual(self.client.get(f"{paid_base}&from_date=2026-10-22&to_date=2026-10-22").json()["total"], 1)
        self.assertEqual(self.client.get(f"{paid_base}&to_date=2026-10-21").json()["total"], 0)

    def test_invalid_date_ranges_rejected_consistently(self):
        for path in ("suppliers", f'entries?supplier_id={self.supplier["id"]}', f'payments?supplier_id={self.supplier["id"]}'):
            separator = "&" if "?" in path else "?"
            response = self.client.get(f"/api/supplier-debts/{path}{separator}from_date=2026-10-20&to_date=2026-10-19")
            self.assertEqual(response.status_code, 422, response.text)

    def test_all_supplier_list_filters_and_summaries_precede_pagination(self):
        purchase = self.purchase()
        self.adjustment("increase", "80")
        self.adjustment("decrease", "20")
        other = self.post("suppliers", {"name": "Vườn B"})
        self.adjustment("increase", "150", other["id"])
        cancelled = self.adjustment("increase", "900")
        self.post(f'entries/{cancelled["id"]}/cancel', {"reason": "Không tính phiếu hủy"}, 200)
        response = self.client.get("/api/supplier-debts/entries?state=all&page_size=1")
        self.assertEqual(response.status_code, 200, response.text)
        page = response.json()
        self.assertEqual(page["total"], 5)
        self.assertEqual(len(page["items"]), 1)
        self.assertTrue(page["items"][0]["supplier_name"])
        self.assertEqual(Decimal(page["total_increase"]), Decimal("2000230"))
        self.assertEqual(Decimal(page["total_decrease"]), Decimal("20"))
        self.assertEqual(Decimal(page["pending_amount"]), Decimal("2000210"))
        filtered = self.client.get(f'/api/supplier-debts/entries?supplier_id={other["id"]}&state=all').json()
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["items"][0]["supplier_name"], "Vườn B")
        self.assertEqual(Decimal(filtered["pending_amount"]), Decimal("150"))
        self.post("payments", self.pay_payload([purchase], "2000000"))
        paid = self.client.get("/api/supplier-debts/entries?state=paid").json()
        self.assertEqual(paid["total"], 1)
        self.assertEqual(Decimal(paid["pending_amount"]), 0)
        empty = self.client.get("/api/supplier-debts/entries?from_date=2026-10-20").json()
        self.assertEqual(empty["total"], 0)
        self.assertEqual(Decimal(empty["total_increase"]), 0)

    def test_old_payment_snapshots_without_supplier_name_remain_readable(self):
        purchase = self.purchase()
        payment = self.post("payments", self.pay_payload([purchase], "2000000"))
        saved = self.db.get(SupplierDebtPayment, payment["id"])
        saved.entries_snapshot = [{k: v for k, v in entry.items() if k != "supplier_name"} for entry in saved.entries_snapshot]
        self.db.commit()
        response = self.client.get(f'/api/supplier-debts/payments?supplier_id={self.supplier["id"]}')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["items"][0]["entries"][0]["supplier_name"])


if __name__ == "__main__":
    unittest.main()
