from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.user import User
from app.schemas.external_handover import ExternalHandoverBatchRead, ExternalHandoverBatchUpdate
from app.schemas.invoice import InvoiceBulkAuditAssign, InvoiceRead
from app.services import ship_management_service


router = APIRouter(prefix="/ship-management", tags=["ship-management"])


@router.get("/unaudited-invoices", response_model=list[InvoiceRead])
def list_unaudited_invoices(
    from_date: date | None = None,
    to_date: date | None = None,
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.list_unaudited_invoices(db, from_date, to_date)


@router.get("/unaudited-invoice-by-code", response_model=InvoiceRead)
def get_unaudited_invoice_by_code(
    code: str,
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.get_unaudited_invoice_by_code(db, code)


@router.post("/handover", response_model=list[InvoiceRead])
def handover_invoices(
    payload: InvoiceBulkAuditAssign,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.handover_invoices(db, payload, current_user)


@router.get("/external-handover-batches", response_model=list[ExternalHandoverBatchRead])
def list_external_handover_batches(
    from_date: date | None = None,
    to_date: date | None = None,
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.list_batches(db, from_date, to_date)


@router.get("/external-handover-batches/{batch_id}", response_model=ExternalHandoverBatchRead)
def get_external_handover_batch(
    batch_id: int,
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.get_batch(db, batch_id)


@router.put("/external-handover-batches/{batch_id}", response_model=ExternalHandoverBatchRead)
def update_external_handover_batch(
    batch_id: int,
    payload: ExternalHandoverBatchUpdate,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.update_batch(db, batch_id, payload, current_user)


@router.post("/external-handover-batches/{batch_id}/cancel", response_model=ExternalHandoverBatchRead)
def cancel_external_handover_batch(
    batch_id: int,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.cancel_batch(db, batch_id, current_user)
