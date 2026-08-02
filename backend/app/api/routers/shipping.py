from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.user import User
from app.schemas.invoice import InvoiceClaim, InvoiceRead
from app.services import shipping_service


router = APIRouter(prefix="/shipping", tags=["shipping"])


@router.get("/available-invoices", response_model=list[InvoiceRead])
def list_available_invoices(
    current_user: User = Depends(require_permission("shipping.claim")),
    db: Session = Depends(get_db),
):
    return shipping_service.list_available_invoices(db, current_user)


@router.get("/claimed-invoices", response_model=list[InvoiceRead])
def list_claimed_invoices(
    from_date: date | None = None,
    to_date: date | None = None,
    current_user: User = Depends(require_permission("shipping.claim")),
    db: Session = Depends(get_db),
):
    return shipping_service.list_claimed_invoices(db, from_date, to_date, current_user)


@router.post("/claim", response_model=list[InvoiceRead])
def claim_invoices(
    payload: InvoiceClaim,
    current_user: User = Depends(require_permission("shipping.claim")),
    db: Session = Depends(get_db),
):
    return shipping_service.claim_invoices(db, payload.invoice_ids, current_user)


@router.post("/invoices/{invoice_id}/delivered", response_model=InvoiceRead)
def mark_invoice_delivered(
    invoice_id: int,
    current_user: User = Depends(require_permission("shipping.claim")),
    db: Session = Depends(get_db),
):
    return shipping_service.mark_invoice_delivered(db, invoice_id, current_user)
