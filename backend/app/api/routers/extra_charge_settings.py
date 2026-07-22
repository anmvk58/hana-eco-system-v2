from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import require_any_permission, require_permission
from app.models.enums import ExtraChargeType
from app.schemas.extra_charge_setting import ExtraChargeSettingRead, ExtraChargeSettingUpdate
from app.services import extra_charge_setting_service


router = APIRouter(prefix="/extra-charge-settings", tags=["extra-charge-settings"])


@router.get("", response_model=list[ExtraChargeSettingRead], dependencies=[Depends(require_any_permission("extra_charges.view", "invoices.create", "invoices.update"))])
def list_extra_charge_settings(db: Session = Depends(get_db)):
    return extra_charge_setting_service.list_settings(db)


@router.get("/{charge_type}", response_model=ExtraChargeSettingRead, dependencies=[Depends(require_permission("extra_charges.view"))])
def get_extra_charge_setting(charge_type: ExtraChargeType, db: Session = Depends(get_db)):
    return extra_charge_setting_service.get_setting(db, charge_type)


@router.put("/{charge_type}", response_model=ExtraChargeSettingRead, dependencies=[Depends(require_permission("extra_charges.update"))])
def update_extra_charge_setting(
    charge_type: ExtraChargeType,
    payload: ExtraChargeSettingUpdate,
    db: Session = Depends(get_db),
):
    return extra_charge_setting_service.update_setting(db, charge_type, payload)
