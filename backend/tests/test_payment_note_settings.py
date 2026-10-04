"""Payment-note configuration API tests using isolated SQLite, no application DB."""
import os
import unittest

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.api.routers.payment_note_settings import router
from app.database import get_db
from app.models import Base, Permission, Role, User
from app.services import payment_note_setting_service as service


class PaymentNoteSettingsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        service.ensure_defaults(self.db)
        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: self.db
        self.user = User(username="tester", display_name="Người kiểm thử", roles=[])
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def permit(self, code):
        self.user.roles = [Role(name="Test", permissions=[Permission(code=code, name="Test", module="Test")])]

    def test_permission_denial_for_both_endpoints(self):
        self.assertEqual(self.client.get("/api/payment-note-settings").status_code, 403)
        self.assertEqual(self.client.put("/api/payment-note-settings", json={"notes": ["A", "B", "C"]}).status_code, 403)

    def test_defaults_accessible_to_each_collection_permission(self):
        for code in ("shipping.manage", "order_reconciliation.manage"):
            self.permit(code)
            response = self.client.get("/api/payment-note-settings")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["notes"], ["VPB hộ kd", "Techcombank", "VCB An"])

    def test_shared_config_persists_and_startup_does_not_reset(self):
        self.permit("shipping.manage")
        response = self.client.put("/api/payment-note-settings", json={"notes": ["  Ngân hàng A  ", "Tiền mặt", "Ngân hàng B"]})
        self.assertEqual(response.status_code, 200)
        self.db.expire_all()
        service.ensure_defaults(self.db)
        self.permit("order_reconciliation.manage")
        self.assertEqual(self.client.get("/api/payment-note-settings").json()["notes"], ["Ngân hàng A", "Tiền mặt", "Ngân hàng B"])

    def test_add_remove_and_clear_configuration(self):
        self.permit("order_reconciliation.manage")
        for notes in (["A", "B", "C", "D", "E", "F"], ["B", "F"], [], ["Nội dung mới"]):
            response = self.client.put("/api/payment-note-settings", json={"notes": notes})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["notes"], notes)
            self.db.expire_all()
            service.ensure_defaults(self.db)
            self.assertEqual(self.client.get("/api/payment-note-settings").json()["notes"], notes)

    def test_invalid_configuration_does_not_replace_saved_notes(self):
        self.permit("order_reconciliation.manage")
        for notes in (["A", " ", "C"], ["A", "a", "C"], ["A", "B", "x" * 101]):
            response = self.client.put("/api/payment-note-settings", json={"notes": notes})
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/payment-note-settings").json()["notes"], service.DEFAULT_PAYMENT_NOTES)


if __name__ == "__main__":
    unittest.main()
