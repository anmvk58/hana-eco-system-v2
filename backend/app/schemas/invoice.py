from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field, model_validator

from app.models.enums import ExtraChargeType, InvoiceHistoryAction, InvoiceStatus
from app.schemas.common import ORMBase
from app.schemas.customer import CustomerRead


class InvoiceItemCreate(ORMBase):
    product_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)


class InvoiceItemRead(ORMBase):
    id: int
    product_id: int | None
    product_code: str
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    created_at: datetime
    updated_at: datetime


class InvoiceExtraChargeCreate(ORMBase):
    charge_type: ExtraChargeType
    name: str | None = Field(default=None, max_length=120)
    amount: Decimal = Field(ge=0)
    note: str | None = None


class InvoiceExtraChargeRead(ORMBase):
    id: int
    charge_type: ExtraChargeType
    name: str
    amount: Decimal
    note: str | None
    created_at: datetime
    updated_at: datetime


class InvoiceCreate(ORMBase):
    code: str | None = Field(default=None, max_length=60)
    customer_id: int | None = None
    status: InvoiceStatus = InvoiceStatus.draft
    sold_at: datetime | None = None
    note: str | None = None
    items: list[InvoiceItemCreate] = Field(min_length=1)
    extra_charges: list[InvoiceExtraChargeCreate] = Field(default_factory=list)
    reason: str | None = Field(default=None, description="Ghi chú lý do tạo/sửa, sẽ lưu vào invoice_history.")


class InvoiceUpdate(ORMBase):
    customer_id: int | None = None
    status: InvoiceStatus = InvoiceStatus.draft
    sold_at: datetime | None = None
    note: str | None = None
    items: list[InvoiceItemCreate] = Field(min_length=1)
    extra_charges: list[InvoiceExtraChargeCreate] = Field(default_factory=list)
    reason: str | None = Field(default=None, description="Ghi chú lý do sửa, sẽ lưu vào invoice_history.")

    @model_validator(mode="after")
    def ensure_reason_for_completed_invoice_edits(self):
        return self


class InvoiceRead(ORMBase):
    id: int
    code: str
    customer_id: int | None
    customer: CustomerRead | None = None
    status: InvoiceStatus
    sold_at: datetime
    note: str | None
    subtotal: Decimal
    total_extra_charges: Decimal
    total_amount: Decimal
    items: list[InvoiceItemRead]
    extra_charges: list[InvoiceExtraChargeRead]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class InvoiceHistoryRead(ORMBase):
    id: int
    invoice_id: int
    action: InvoiceHistoryAction
    changed_by_user_id: int | None
    changed_by_name: str | None
    reason: str | None
    before_data: dict[str, Any] | None
    after_data: dict[str, Any] | None
    created_at: datetime

