from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_any_permission
from app.database import get_db
from app.models.user import User
from app.schemas.payment_note_setting import PaymentNoteSettings
from app.services import payment_note_setting_service


router = APIRouter(prefix="/payment-note-settings", tags=["payment-note-settings"])
manage_payment_notes = require_any_permission("shipping.manage", "order_reconciliation.manage")


@router.get("", response_model=PaymentNoteSettings)
def get_settings(db: Session = Depends(get_db), _: User = Depends(manage_payment_notes)):
    return payment_note_setting_service.get_settings(db)


@router.put("", response_model=PaymentNoteSettings)
def update_settings(payload: PaymentNoteSettings, db: Session = Depends(get_db), _: User = Depends(manage_payment_notes)):
    return payment_note_setting_service.update_settings(db, payload)
