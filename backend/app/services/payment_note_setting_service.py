from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.payment_note_setting import PaymentNoteSetting
from app.schemas.payment_note_setting import PaymentNoteSettings


DEFAULT_PAYMENT_NOTES = ["VPB hộ kd", "Techcombank", "VCB An"]


def ensure_defaults(db: Session) -> None:
    if db.get(PaymentNoteSetting, 1) is None:
        db.add(PaymentNoteSetting(id=1, notes=list(DEFAULT_PAYMENT_NOTES)))
        db.commit()


def get_settings(db: Session) -> PaymentNoteSettings:
    setting = db.get(PaymentNoteSetting, 1)
    return PaymentNoteSettings(notes=setting.notes if setting else list(DEFAULT_PAYMENT_NOTES))


def update_settings(db: Session, payload: PaymentNoteSettings) -> PaymentNoteSettings:
    try:
        setting = db.scalar(select(PaymentNoteSetting).where(PaymentNoteSetting.id == 1).with_for_update())
        if setting is None:
            setting = PaymentNoteSetting(id=1)
            db.add(setting)
        setting.notes = list(payload.notes)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_settings(db)
