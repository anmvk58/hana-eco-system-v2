from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.user import User
from app.schemas.ahamove import AhamoveBatchComplete, AhamoveHandover
from app.schemas.external_handover import ExternalHandoverBatchNoteUpdate, ExternalHandoverBatchRead
from app.schemas.invoice import InvoiceRead
from app.services import ship_management_service


router = APIRouter(prefix="/ahamove", tags=["ahamove"])


@router.post("/external-handover-batches/{batch_id}/cancel", response_model=ExternalHandoverBatchRead)
def cancel_external_handover_batch(
    batch_id: int,
    current_user: User = Depends(require_permission("ahamove.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.cancel_batch(db, batch_id, current_user)


@router.get("/unaudited-invoices", response_model=list[InvoiceRead])
def list_unaudited_invoices(
    from_date: date | None = None,
    to_date: date | None = None,
    _: User = Depends(require_permission("ahamove.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.list_unaudited_invoices(db, from_date, to_date)


@router.post("/handover", response_model=list[InvoiceRead])
def handover_invoices(
    payload: AhamoveHandover,
    current_user: User = Depends(require_permission("ahamove.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.handover_invoices(db, payload, current_user)


@router.get("/external-handover-batches", response_model=list[ExternalHandoverBatchRead])
def list_external_handover_batches(
    from_date: date | None = None,
    to_date: date | None = None,
    _: User = Depends(require_permission("ahamove.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.list_batches(db, from_date, to_date, active_only=True)


@router.patch("/external-handover-batches/{batch_id}/note", response_model=ExternalHandoverBatchRead)
def update_batch_note(
    batch_id: int,
    payload: ExternalHandoverBatchNoteUpdate,
    current_user: User = Depends(require_permission("ahamove.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.update_batch_note(db, batch_id, payload, current_user)


@router.post("/external-handover-batches/{batch_id}/complete", response_model=ExternalHandoverBatchRead)
def complete_batch(
    batch_id: int,
    payload: AhamoveBatchComplete,
    current_user: User = Depends(require_permission("ahamove.manage")),
    db: Session = Depends(get_db),
):
    return ship_management_service.complete_batch(db, batch_id, payload, current_user)
