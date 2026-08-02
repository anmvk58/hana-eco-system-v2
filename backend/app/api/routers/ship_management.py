from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.user import User
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


@router.post("/handover", response_model=list[InvoiceRead])
def handover_invoices(
    payload: InvoiceBulkAuditAssign,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.handover_invoices(db, payload, current_user)
