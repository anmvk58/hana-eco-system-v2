"""Access-control regressions using isolated SQLite, never the application DB."""
import os
import unittest
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.api.deps import permission_codes
from app.api.routers import access_control, ahamove, internal_cod_collections, order_reconciliation, ship_management
from app.core.permissions import INTERNAL_SHIPPER_ROLE_NAME, SYSTEM_ADMIN_ROLE_NAME
from app.core.security import hash_password
from app.database import get_db
from app.models import Base, Invoice, InvoiceHistory, Permission, Role, User
from app.models.external_handover import ExternalHandoverBatch
from app.schemas.access_control import RolePayload, UserUpdate
from app.services import access_control_service as service

class AccessControlTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        shipping = Permission(code='shipping.manage', name='Shipping', module='Shipping')
        self.role = Role(name='Seller', permissions=[shipping])
        self.seller = User(username='seller', display_name='Seller', password_hash=hash_password('test-password'), roles=[self.role])
        self.db.add(self.seller)
        self.db.commit()
        service.ensure_defaults(self.db)
        self.admin = self.db.scalar(select(User).where(User.username == 'admin'))
        app = FastAPI()
        for router in (access_control.router, ahamove.router, internal_cod_collections.router, order_reconciliation.router, ship_management.router):
            app.include_router(router, prefix='/api')
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)
        response = self.client.post('/api/auth/login', json={'username': 'seller', 'password': 'test-password'})
        self.assertEqual(response.status_code, 200)
        self.headers = {'Authorization': 'Bearer ' + response.json()['access_token']}

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def me(self):
        return self.client.get('/api/auth/me', headers=self.headers).json()['permissions']

    def test_startup_never_grants_cod_or_reconciliation_to_shipping_roles(self):
        self.assertEqual(permission_codes(self.seller), {'shipping.manage'})
        self.assertIn('internal_cod_collections.manage', permission_codes(self.admin))
        self.assertIn('order_reconciliation.manage', permission_codes(self.admin))
        service.ensure_defaults(self.db)
        self.assertEqual(permission_codes(self.seller), {'shipping.manage'})

    def test_shipping_role_denied_all_cod_endpoints_but_shipping_still_works(self):
        for path in ('summary', 'sessions', 'sessions/1'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get('/api/internal-cod-collections/' + path, headers=self.headers).status_code, 403)
        response = self.client.post('/api/internal-cod-collections/sessions', headers=self.headers, json={'shipper_id': 1, 'collection_date': '2026-11-02', 'invoice_ids': [1]})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get('/api/ship-management/unaudited-invoices', headers=self.headers).status_code, 200)

    def test_cod_role_independent_and_revocation_affects_existing_session(self):
        role = service.save_role(self.db, RolePayload(name='COD', permission_codes=['internal_cod_collections.manage']))
        service.save_user(self.db, UserUpdate(role_ids=[role.id]), self.seller, self.admin)
        for path in ('summary', 'sessions'):
            self.assertEqual(self.client.get('/api/internal-cod-collections/' + path, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/api/ship-management/unaudited-invoices', headers=self.headers).status_code, 403)
        self.assertEqual(self.me(), ['internal_cod_collections.manage'])
        service.save_role(self.db, RolePayload(name='COD', permission_codes=[]), role)
        self.assertEqual(self.client.get('/api/internal-cod-collections/summary', headers=self.headers).status_code, 403)
        self.assertEqual(self.me(), [])

    def test_permissions_union_and_removing_one_role_preserves_other_grants(self):
        role = service.save_role(self.db, RolePayload(name='Additional', permission_codes=['shipping.manage', 'internal_cod_collections.manage']))
        service.save_user(self.db, UserUpdate(role_ids=[self.role.id, role.id]), self.seller, self.admin)
        self.assertEqual(set(self.me()), {'shipping.manage', 'internal_cod_collections.manage'})
        service.save_role(self.db, RolePayload(name='Additional', permission_codes=[]), role)
        self.assertEqual(self.me(), ['shipping.manage'])

    def test_system_shipper_is_not_a_system_administrator(self):
        role = self.db.scalar(select(Role).where(Role.name == INTERNAL_SHIPPER_ROLE_NAME))
        shipper = User(username='shipper', display_name='Shipper', roles=[role])
        self.db.add(shipper)
        self.db.commit()
        with self.assertRaises(HTTPException) as result:
            service.save_user(self.db, UserUpdate(role_ids=[]), self.admin, self.seller)
        self.assertEqual(result.exception.status_code, 400)
        with self.assertRaises(HTTPException):
            service.deactivate_user(self.db, self.admin.id, self.seller)
        service.save_user(self.db, UserUpdate(role_ids=[]), shipper, self.admin)
        self.assertEqual(shipper.roles, [])

    def test_system_roles_cannot_be_modified_or_deleted(self):
        for name in (SYSTEM_ADMIN_ROLE_NAME, INTERNAL_SHIPPER_ROLE_NAME):
            role = self.db.scalar(select(Role).where(Role.name == name))
            with self.assertRaises(HTTPException):
                service.save_role(self.db, RolePayload(name=name, permission_codes=[]), role)
            with self.assertRaises(HTTPException):
                service.delete_role(self.db, role.id)

    def test_shipping_does_not_implicitly_grant_ahamove(self):
        self.assertNotIn('ahamove.manage', permission_codes(self.seller))
        self.assertIn('ahamove.manage', permission_codes(self.admin))
        self.assertEqual(self.client.get('/api/ahamove/unaudited-invoices', headers=self.headers).status_code, 403)
        payload = {'invoice_ids': [1], 'audit_label': 'external_shipper', 'external_handoff': {'advance_method': 'transfer', 'shipping_fee': '10000', 'transfer_amount': '90000', 'cash_amount': '0'}}
        self.assertEqual(self.client.post('/api/ahamove/handover', headers=self.headers, json=payload).status_code, 403)

    def test_ahamove_only_handover_preserves_finance_and_history_without_shipping_access(self):
        role = service.save_role(self.db, RolePayload(name='AHAMOVE', permission_codes=['ahamove.manage']))
        service.save_user(self.db, UserUpdate(role_ids=[role.id]), self.seller, self.admin)
        self.assertEqual(self.me(), ['ahamove.manage'])
        invoice = Invoice(code='HD-261102-001', subtotal=100000, total_amount=100000)
        self.db.add(invoice)
        self.db.commit()
        invoice_id = invoice.id
        response = self.client.get('/api/ahamove/unaudited-invoices', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn(invoice_id, [row['id'] for row in response.json()])
        for path in ('unaudited-invoices', 'internal-shippers', 'internal-handover-invoices', 'external-handover-batches'):
            self.assertEqual(self.client.get('/api/ship-management/' + path, headers=self.headers).status_code, 403)
        self.assertEqual(self.client.get('/api/internal-cod-collections/summary', headers=self.headers).status_code, 403)
        self.assertEqual(self.client.post('/api/ahamove/handover', headers=self.headers, json={'invoice_ids': [invoice_id], 'audit_label': 'retail'}).status_code, 422)
        self.assertEqual(self.client.post('/api/ahamove/handover', headers=self.headers, json={'invoice_ids': [invoice_id], 'audit_label': 'external_shipper'}).status_code, 422)
        self.db.refresh(invoice)
        self.assertIsNone(invoice.audit_label)
        payload = {'invoice_ids': [invoice_id], 'audit_label': 'external_shipper', 'external_handoff': {'advance_method': 'transfer', 'shipping_fee': '10000', 'transfer_amount': '90000', 'cash_amount': '0'}}
        self.assertEqual(self.client.post('/api/ship-management/handover', headers=self.headers, json=payload).status_code, 403)
        response = self.client.post('/api/ahamove/handover', headers=self.headers, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()[0]['audit_label'], 'external_shipper')
        self.db.refresh(invoice)
        self.assertEqual(invoice.total_amount, 100000)
        batch = self.db.scalar(select(ExternalHandoverBatch))
        self.assertEqual(batch.shipping_fee, 10000)
        self.assertEqual(batch.advance_amount, 90000)
        self.assertEqual(batch.transfer_amount, 90000)
        self.assertEqual(len(self.db.scalars(select(InvoiceHistory).where(InvoiceHistory.invoice_id == invoice_id)).all()), 1)
        self.assertEqual(self.client.post('/api/ahamove/handover', headers=self.headers, json=payload).status_code, 409)
        service.save_role(self.db, RolePayload(name='AHAMOVE', permission_codes=[]), role)
        self.assertEqual(self.client.get('/api/ahamove/unaudited-invoices', headers=self.headers).status_code, 403)

    def test_ahamove_board_reads_active_external_batches_with_customer_details(self):
        path = '/api/ahamove/external-handover-batches'
        self.assertEqual(self.client.get(path, headers=self.headers).status_code, 403)
        role = service.save_role(self.db, RolePayload(name='Board', permission_codes=['ahamove.manage']))
        service.save_user(self.db, UserUpdate(role_ids=[role.id]), self.seller, self.admin)
        from app.models import Customer
        from app.services import ship_management_service
        customer = Customer(code='KH-BOARD', name='Khách kiểm thử', phone='0900000000', address='123 Đường kiểm thử')
        invoices = [Invoice(code=f'HD-BOARD-{i}', customer=customer, subtotal=100000, total_amount=100000) for i in range(2)]
        self.db.add_all(invoices)
        self.db.commit()
        for invoice in invoices:
            payload = {'invoice_ids': [invoice.id], 'audit_label': 'external_shipper', 'external_handoff': {'advance_method': 'transfer', 'shipping_fee': '10000', 'transfer_amount': '90000', 'cash_amount': '0'}}
            self.assertEqual(self.client.post('/api/ahamove/handover', headers=self.headers, json=payload).status_code, 200)
        response = self.client.get(path, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        batches = response.json()
        self.assertEqual(len(batches), 2)
        self.assertEqual(batches[0]['items'][0]['invoice']['customer']['address'], customer.address)
        self.assertEqual(batches[0]['items'][0]['invoice']['customer']['name'], customer.name)
        self.assertEqual(float(batches[0]['items'][0]['invoice']['total_amount']), 100000)
        ship_management_service.cancel_batch(self.db, batches[1]['id'], self.admin)
        visible = self.client.get(path, headers=self.headers).json()
        self.assertEqual([batch['id'] for batch in visible], [batches[0]['id']])
        self.assertEqual(self.client.get(path, headers=self.headers, params={'from_date': '2099-01-01'}).json(), [])
        self.assertEqual(self.client.get(path, headers=self.headers, params={'from_date': '2026-11-02', 'to_date': '2026-11-01'}).status_code, 422)
        self.assertEqual(self.client.get('/api/ship-management/external-handover-batches', headers=self.headers).status_code, 403)

    def create_note_batch(self, code="HD-NOTE-001"):
        invoice = Invoice(code=code, subtotal=100000, total_amount=100000)
        self.db.add(invoice)
        self.db.commit()
        response = self.client.post('/api/ship-management/handover', headers=self.headers, json={'invoice_ids': [invoice.id], 'audit_label': 'external_shipper', 'external_handoff': {'advance_method': 'transfer', 'shipping_fee': '10000', 'transfer_amount': '90000', 'cash_amount': '0'}})
        self.assertEqual(response.status_code, 200)
        return self.db.scalar(select(ExternalHandoverBatch).order_by(ExternalHandoverBatch.id.desc())).id

    def grant_note_permissions(self):
        for code in ('ahamove.manage', 'order_reconciliation.manage'):
            self.role.permissions.append(self.db.scalar(select(Permission).where(Permission.code == code)))
        self.db.commit()

    def test_batch_note_persists_and_appears_in_reconciliation_without_financial_changes(self):
        batch_id = self.create_note_batch()
        path = f'/api/ahamove/external-handover-batches/{batch_id}/note'
        self.assertEqual(self.client.patch(path, headers=self.headers, json={'note': 'Denied', 'expected_note': None}).status_code, 403)
        self.grant_note_permissions()
        before = self.client.get('/api/ahamove/external-handover-batches', headers=self.headers).json()[0]
        response = self.client.patch(path, headers=self.headers, json={'note': '  Giao cổng sau\nGọi trước khi đến  ', 'expected_note': None})
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        expected = 'Giao cổng sau\nGọi trước khi đến'
        self.assertEqual(saved['note'], expected)
        for key in ('status', 'shipping_fee', 'advance_amount', 'cash_amount', 'transfer_amount', 'items'):
            self.assertEqual(saved[key], before[key])
        with Session(self.engine) as db:
            self.assertEqual(db.get(ExternalHandoverBatch, batch_id).note, expected)
            self.assertEqual(db.get(ExternalHandoverBatch, batch_id).updated_by_user_id, self.seller.id)
            self.assertEqual(len(db.scalars(select(InvoiceHistory)).all()), 1)
        rows = self.client.get('/api/order-reconciliation/external-handover-batches', headers=self.headers).json()
        self.assertEqual(rows[0]['batch']['note'], expected)
        self.assertIsNone(rows[0]['reconciliation'])
        self.assertEqual(self.client.patch(path, headers=self.headers, json={'note': 'Stale overwrite', 'expected_note': None}).status_code, 409)
        cleared = self.client.patch(path, headers=self.headers, json={'note': '  ', 'expected_note': expected})
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()['note'])
        self.assertEqual(self.client.patch(path, headers=self.headers, json={'note': 'x' * 2001, 'expected_note': None}).status_code, 422)
        self.assertEqual(self.client.patch(path, headers=self.headers, json={'note': 'Missing version'}).status_code, 422)
        self.assertEqual(self.client.patch('/api/ahamove/external-handover-batches/9999/note', headers=self.headers, json={'note': '', 'expected_note': None}).status_code, 404)

    def test_reconciled_batch_note_is_preserved_and_readable_separately_from_collection_note(self):
        batch_id = self.create_note_batch()
        self.grant_note_permissions()
        path = f'/api/ahamove/external-handover-batches/{batch_id}/note'
        self.assertEqual(self.client.patch(path, headers=self.headers, json={'note': 'Ghi chú giao hàng', 'expected_note': None}).status_code, 200)
        from app.services.order_reconciliation_service import reconcile_external_handover_batch
        from app.schemas.order_reconciliation import ExternalHandoverReconcileCreate
        result = reconcile_external_handover_batch(self.db, batch_id, ExternalHandoverReconcileCreate(note='Đã nhận đủ tiền'), self.admin)
        self.assertEqual(result['batch']['note'], 'Ghi chú giao hàng')
        self.assertEqual(result['reconciliation']['note'], 'Đã nhận đủ tiền')
        self.assertEqual(self.client.patch(path, headers=self.headers, json={'note': 'Changed', 'expected_note': 'Ghi chú giao hàng'}).status_code, 409)
        row = self.client.get('/api/order-reconciliation/external-handover-batches', headers=self.headers).json()[0]
        self.assertEqual(row['batch']['note'], 'Ghi chú giao hàng')
        self.assertEqual(row['reconciliation']['note'], 'Đã nhận đủ tiền')

    def test_cancelled_batch_note_cannot_be_changed(self):
        batch_id = self.create_note_batch()
        self.grant_note_permissions()
        from app.services import ship_management_service
        ship_management_service.cancel_batch(self.db, batch_id, self.admin)
        response = self.client.patch(f'/api/ahamove/external-handover-batches/{batch_id}/note', headers=self.headers, json={'note': 'Changed', 'expected_note': None})
        self.assertEqual(response.status_code, 409)

    def test_ahamove_allows_zero_advance_for_transferred_orders_and_cod_equal_to_shipping(self):
        role = service.save_role(self.db, RolePayload(name='Zero advance', permission_codes=['ahamove.manage']))
        service.save_user(self.db, UserUpdate(role_ids=[role.id]), self.seller, self.admin)
        for index, (paid, fee) in enumerate(((True, '0'), (False, '100000'))):
            with self.subTest(paid=paid, shipping_fee=fee):
                invoice = Invoice(code=f'HD-ZERO-{index}', subtotal=100000, total_amount=100000, is_paid_by_transfer=paid)
                self.db.add(invoice)
                self.db.commit()
                invoice_id = invoice.id
                payload = {'invoice_ids': [invoice_id], 'audit_label': 'external_shipper', 'external_handoff': {'advance_method': 'transfer', 'shipping_fee': fee, 'transfer_amount': '0', 'cash_amount': '0'}}
                response = self.client.post('/api/ahamove/handover', headers=self.headers, json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()[0]['audit_label'], 'external_shipper')
                self.assertEqual(response.json()[0]['is_paid_by_transfer'], paid)
                self.assertEqual(float(response.json()[0]['total_amount']), 100000)
                batches = self.client.get('/api/ahamove/external-handover-batches', headers=self.headers).json()
                batch = next(batch for batch in batches if any(item['invoice_id'] == invoice_id for item in batch['items']))
                self.assertEqual(float(batch['advance_amount']), 0)
                self.assertEqual(float(batch['transfer_amount']), 0)
                self.assertEqual(float(batch['shipping_fee']), float(fee))
                self.assertEqual(len(self.db.scalars(select(InvoiceHistory).where(InvoiceHistory.invoice_id == invoice_id)).all()), 1)
                self.assertEqual(self.client.post('/api/ahamove/handover', headers=self.headers, json=payload).status_code, 409)

    def test_ahamove_zero_advance_validation_is_scoped_and_still_rejects_negative_amounts(self):
        from pydantic import ValidationError
        from app.schemas.ahamove import AhamoveExternalHandoffCreate
        from app.schemas.invoice import ExternalHandoffCreate
        values = {'advance_method': 'transfer', 'shipping_fee': '0', 'transfer_amount': '0', 'cash_amount': '0'}
        self.assertEqual(AhamoveExternalHandoffCreate(**values).transfer_amount, 0)
        with self.assertRaises(ValidationError):
            ExternalHandoffCreate(**values)
        for changes in ({'transfer_amount': '-1'}, {'shipping_fee': '-1'}, {'cash_amount': '1'}, {'advance_method': 'cash'}, {'advance_method': 'mixed'}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                AhamoveExternalHandoffCreate(**(values | changes))

    def test_complete_batch_saves_payment_notes_and_status_without_changing_legacy_or_finance(self):
        batch_id = self.create_note_batch()
        path = f'/api/ahamove/external-handover-batches/{batch_id}/complete'
        payload = {'transfer_note': '  VPB hộ kinh doanh  ', 'cash_note': '  ', 'expected_note': None}
        self.assertEqual(self.client.post(path, headers=self.headers, json=payload).status_code, 403)
        self.grant_note_permissions()
        before = self.client.get('/api/ahamove/external-handover-batches', headers=self.headers).json()[0]
        self.assertEqual(before['handover_status'], 'created')
        response = self.client.post(path, headers=self.headers, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        after = response.json()
        self.assertEqual(after['handover_status'], 'completed')
        self.assertEqual(after['transfer_note'], 'VPB hộ kinh doanh')
        self.assertIsNone(after['cash_note'])
        self.assertIsNotNone(after['completed_at'])
        self.assertEqual(after['completed_by_user_id'], self.seller.id)
        for key in ('note', 'status', 'advance_amount', 'shipping_fee', 'transfer_amount', 'cash_amount', 'items', 'is_reconciled'):
            self.assertEqual(after[key], before[key])
        with Session(self.engine) as db:
            batch = db.get(ExternalHandoverBatch, batch_id)
            self.assertEqual(batch.transfer_note, 'VPB hộ kinh doanh')
            self.assertIsNone(batch.cash_note)
            self.assertIsNotNone(batch.completed_at)
            self.assertEqual(len(db.scalars(select(InvoiceHistory)).all()), 1)
        row = self.client.get('/api/order-reconciliation/external-handover-batches', headers=self.headers).json()[0]
        self.assertIsNone(row['reconciliation'])
        self.assertEqual(row['batch']['transfer_note'], 'VPB hộ kinh doanh')
        self.assertEqual(row['batch']['handover_status'], 'completed')
        self.assertEqual(self.client.post(path, headers=self.headers, json=payload).status_code, 409)

    def test_completion_requires_at_least_one_nonblank_payment_note(self):
        batch_id = self.create_note_batch()
        self.grant_note_permissions()
        path = f'/api/ahamove/external-handover-batches/{batch_id}/complete'
        for notes in ({}, {'transfer_note': '', 'cash_note': ''}, {'transfer_note': '  ', 'cash_note': '\t'}, {'transfer_note': None, 'cash_note': None}, {'transfer_note': 'x' * 1001}):
            with self.subTest(notes=notes):
                response = self.client.post(path, headers=self.headers, json={'expected_note': None, **notes})
                self.assertEqual(response.status_code, 422)
        self.db.expire_all()
        batch = self.db.get(ExternalHandoverBatch, batch_id)
        self.assertIsNone(batch.completed_at)
        self.assertIsNone(batch.transfer_note)
        self.assertIsNone(batch.cash_note)

    def test_cash_only_and_both_payment_notes_are_saved(self):
        self.grant_note_permissions()
        for index, notes in enumerate(({'transfer_note': '', 'cash_note': '  Nhận tại quầy  '}, {'transfer_note': 'VPB', 'cash_note': 'Nhận tại quầy'})):
            batch_id = self.create_note_batch(code=f'HD-PAYMENT-NOTE-{index}')
            response = self.client.post(f'/api/ahamove/external-handover-batches/{batch_id}/complete', headers=self.headers, json={'expected_note': None, **notes})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['cash_note'], 'Nhận tại quầy')
            self.assertEqual(response.json()['transfer_note'], notes['transfer_note'] or None)

    def test_completion_guards_stale_note_and_preserves_reconciled_legacy_note(self):
        batch_id = self.create_note_batch()
        self.grant_note_permissions()
        base = f'/api/ahamove/external-handover-batches/{batch_id}'
        self.assertEqual(self.client.patch(base + '/note', headers=self.headers, json={'note': 'Current', 'expected_note': None}).status_code, 200)
        self.assertEqual(self.client.post(base + '/complete', headers=self.headers, json={'transfer_note': 'VPB', 'expected_note': None}).status_code, 409)
        self.db.expire_all()
        self.assertIsNone(self.db.get(ExternalHandoverBatch, batch_id).completed_at)
        from app.services.order_reconciliation_service import reconcile_external_handover_batch
        from app.schemas.order_reconciliation import ExternalHandoverReconcileCreate
        reconcile_external_handover_batch(self.db, batch_id, ExternalHandoverReconcileCreate(note='Finance note'), self.admin)
        response = self.client.post(base + '/complete', headers=self.headers, json={'cash_note': 'Tiền mặt tại quầy', 'expected_note': 'Current'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()['is_reconciled'])
        self.assertEqual(response.json()['note'], 'Current')
        self.assertEqual(response.json()['cash_note'], 'Tiền mặt tại quầy')
        row = self.client.get('/api/order-reconciliation/external-handover-batches', headers=self.headers).json()[0]
        self.assertEqual(row['reconciliation']['note'], 'Finance note')

    def test_cancelled_batch_cannot_be_completed(self):
        batch_id = self.create_note_batch()
        self.grant_note_permissions()
        from app.services import ship_management_service
        ship_management_service.cancel_batch(self.db, batch_id, self.admin)
        response = self.client.post(f'/api/ahamove/external-handover-batches/{batch_id}/complete', headers=self.headers, json={'cash_note': 'Ghi chú', 'expected_note': None})
        self.assertEqual(response.status_code, 409)
        self.db.expire_all()
        self.assertIsNone(self.db.get(ExternalHandoverBatch, batch_id).completed_at)
