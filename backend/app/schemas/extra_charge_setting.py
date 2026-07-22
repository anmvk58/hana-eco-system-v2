from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import ExtraChargeType
from app.schemas.common import ORMBase


class ExtraChargeSettingUpdate(ORMBase):
    name: str | None = Field(default=None, max_length=120)
    default_amount: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = None
    note: str | None = None


class ExtraChargeSettingRead(ORMBase):
    id: int
    charge_type: ExtraChargeType
    name: str
    default_amount: Decimal
    is_active: bool
    note: str | None
    created_at: datetime
    updated_at: datetime
