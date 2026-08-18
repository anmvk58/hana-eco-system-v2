from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.user import User
from app.models.enums import InvoiceAuditLabel
from app.schemas.invoice import InvoiceRead
from app.schemas.order_reconciliation import (
    ExternalHandoverReconcileCreate,
    ExternalHandoverReconciliationRowRead,
    RetailInvoiceCollectCreate,
    RetailInvoiceReconciliationRead,
)
from app.services import invoice_service, order_reconciliation_service


router = APIRouter(prefix="/order-reconciliation", tags=["order-reconciliation"])


@router.get("/unaudited-invoices", response_model=list[InvoiceRead])
def list_unaudited_invoices(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return order_reconciliation_service.list_unaudited_invoices(db, from_date, to_date)


@router.get("/retail-invoices", response_model=list[RetailInvoiceReconciliationRead])
def list_retail_invoices(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return order_reconciliation_service.list_retail_invoices(db, from_date, to_date)


@router.post("/unaudited-invoices/{invoice_id}/mark-retail", response_model=InvoiceRead)
def mark_invoice_as_retail(
    invoice_id: int,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return invoice_service.assign_audit_label(db, invoice_id, InvoiceAuditLabel.retail, current_user)


@router.post("/retail-invoices/{invoice_id}/collect", response_model=RetailInvoiceReconciliationRead)
def collect_retail_invoice(
    invoice_id: int,
    payload: RetailInvoiceCollectCreate,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return order_reconciliation_service.collect_retail_invoice(db, invoice_id, payload, current_user)


@router.get("/external-handover-batches", response_model=list[ExternalHandoverReconciliationRowRead])
def list_external_handover_reconciliations(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return order_reconciliation_service.list_external_handover_reconciliations(db, from_date, to_date)


@router.post(
    "/external-handover-batches/{batch_id}/reconcile",
    response_model=ExternalHandoverReconciliationRowRead,
)
def reconcile_external_handover_batch(
    batch_id: int,
    payload: ExternalHandoverReconcileCreate,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return order_reconciliation_service.reconcile_external_handover_batch(db, batch_id, payload, current_user)
