from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_any_permission, require_permission
from app.database import get_db
from app.models.enums import InvoiceAuditLabel, InvoiceStatus
from app.schemas.invoice import InvoiceAuditAssign, InvoiceCancel, InvoiceCreate, InvoiceHistoryRead, InvoicePage, InvoiceRead, InvoiceUpdate
from app.services import invoice_service
from app.models.user import User


router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=InvoicePage, dependencies=[Depends(require_any_permission("invoices.view", "dashboard.view", "reports.view"))])
def list_invoices(
    status_filter: InvoiceStatus | None = Query(default=None, alias="status"),
    customer_id: int | None = None,
    code_filter: str | None = Query(default=None, alias="code", max_length=60),
    customer_phone: str | None = Query(default=None, max_length=30),
    audit_label: InvoiceAuditLabel | None = None,
    unaudited: bool = False,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    include_deleted: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total, current_page, total_pages = invoice_service.list_invoices(
        db,
        status_filter,
        customer_id,
        code_filter,
        customer_phone,
        audit_label,
        unaudited,
        from_date,
        to_date,
        include_deleted,
        page,
        page_size,
    )
    return InvoicePage(
        items=items,
        total=total,
        page=current_page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    current_user: User = Depends(require_permission("invoices.create")),
    db: Session = Depends(get_db),
):
    return invoice_service.create_invoice(db, payload, current_user.id, current_user.display_name)


@router.get("/{invoice_id}", response_model=InvoiceRead, dependencies=[Depends(require_any_permission("invoices.view", "invoices.update"))])
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    return invoice_service.get_invoice(db, invoice_id)


@router.put("/{invoice_id}", response_model=InvoiceRead)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    current_user: User = Depends(require_permission("invoices.update")),
    db: Session = Depends(get_db),
):
    return invoice_service.update_invoice(db, invoice_id, payload, current_user.id, current_user.display_name)


@router.post("/{invoice_id}/cancel", response_model=InvoiceRead)
def cancel_invoice(
    invoice_id: int,
    payload: InvoiceCancel,
    current_user: User = Depends(require_permission("invoices.cancel")),
    db: Session = Depends(get_db),
):
    return invoice_service.cancel_invoice(db, invoice_id, current_user.id, current_user.display_name, payload.reason)


@router.post("/{invoice_id}/audit", response_model=InvoiceRead)
def assign_audit_label(
    invoice_id: int,
    payload: InvoiceAuditAssign,
    current_user: User = Depends(require_permission("invoices.audit")),
    db: Session = Depends(get_db),
):
    return invoice_service.assign_audit_label(db, invoice_id, payload.audit_label, current_user)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: int,
    reason: str | None = Query(default=None),
    current_user: User = Depends(require_permission("invoices.delete")),
    db: Session = Depends(get_db),
):
    invoice_service.soft_delete_invoice(db, invoice_id, current_user.id, current_user.display_name, reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{invoice_id}/history", response_model=list[InvoiceHistoryRead], dependencies=[Depends(require_permission("invoices.history"))])
def get_invoice_history(invoice_id: int, db: Session = Depends(get_db)):
    return invoice_service.list_invoice_history(db, invoice_id)


@router.get("/{invoice_id}/print", response_model=InvoiceRead, dependencies=[Depends(require_permission("invoices.print"))])
def get_invoice_print_data(invoice_id: int, db: Session = Depends(get_db)):
    return invoice_service.get_invoice(db, invoice_id)

