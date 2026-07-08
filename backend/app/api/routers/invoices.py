from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import UserIdHeader, UserNameHeader
from app.database import get_db
from app.models.enums import InvoiceStatus
from app.schemas.invoice import InvoiceCreate, InvoiceHistoryRead, InvoiceRead, InvoiceUpdate
from app.services import invoice_service


router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    status_filter: InvoiceStatus | None = Query(default=None, alias="status"),
    customer_id: int | None = None,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    return invoice_service.list_invoices(db, status_filter, customer_id, from_date, to_date, include_deleted, skip, limit)


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    x_user_id: UserIdHeader = None,
    x_user_name: UserNameHeader = None,
    db: Session = Depends(get_db),
):
    return invoice_service.create_invoice(db, payload, x_user_id, x_user_name)


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    return invoice_service.get_invoice(db, invoice_id)


@router.put("/{invoice_id}", response_model=InvoiceRead)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    x_user_id: UserIdHeader = None,
    x_user_name: UserNameHeader = None,
    db: Session = Depends(get_db),
):
    return invoice_service.update_invoice(db, invoice_id, payload, x_user_id, x_user_name)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: int,
    reason: str | None = Query(default=None),
    x_user_id: UserIdHeader = None,
    x_user_name: UserNameHeader = None,
    db: Session = Depends(get_db),
):
    invoice_service.soft_delete_invoice(db, invoice_id, x_user_id, x_user_name, reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{invoice_id}/history", response_model=list[InvoiceHistoryRead])
def get_invoice_history(invoice_id: int, db: Session = Depends(get_db)):
    return invoice_service.list_invoice_history(db, invoice_id)


@router.get("/{invoice_id}/print", response_model=InvoiceRead)
def get_invoice_print_data(invoice_id: int, db: Session = Depends(get_db)):
    return invoice_service.get_invoice(db, invoice_id)

