from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ExtraChargeType
from app.models.extra_charge_setting import ExtraChargeSetting
from app.schemas.extra_charge_setting import ExtraChargeSettingUpdate


DEFAULT_EXTRA_CHARGE_SETTINGS = {
    ExtraChargeType.shipping: {"name": "Phí ship", "default_amount": Decimal("0")},
    ExtraChargeType.packing: {"name": "Phí đóng hàng", "default_amount": Decimal("0")},
    ExtraChargeType.other: {"name": "Phụ thu khác", "default_amount": Decimal("0")},
}


def ensure_default_extra_charge_settings(db: Session) -> None:
    existing_types = set(db.scalars(select(ExtraChargeSetting.charge_type)).all())
    for charge_type, defaults in DEFAULT_EXTRA_CHARGE_SETTINGS.items():
        if charge_type not in existing_types:
            db.add(ExtraChargeSetting(charge_type=charge_type, **defaults))
    db.commit()


def list_settings(db: Session) -> list[ExtraChargeSetting]:
    stmt = select(ExtraChargeSetting).order_by(ExtraChargeSetting.id.asc())
    return list(db.scalars(stmt).all())


def get_setting(db: Session, charge_type: ExtraChargeType) -> ExtraChargeSetting:
    setting = db.scalar(select(ExtraChargeSetting).where(ExtraChargeSetting.charge_type == charge_type))
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extra charge setting not found")
    return setting


def update_setting(db: Session, charge_type: ExtraChargeType, payload: ExtraChargeSettingUpdate) -> ExtraChargeSetting:
    setting = get_setting(db, charge_type)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(setting, field, value)
    db.commit()
    db.refresh(setting)
    return setting
