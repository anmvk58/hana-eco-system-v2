from decimal import Decimal

from sqlalchemy import Boolean, Enum, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import ExtraChargeType
from app.models.mixins import TimestampMixin


class ExtraChargeSetting(Base, TimestampMixin):
    __tablename__ = "extra_charge_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    charge_type: Mapped[ExtraChargeType] = mapped_column(Enum(ExtraChargeType), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    default_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
