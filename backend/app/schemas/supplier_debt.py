from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.schemas.common import ORMBase

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


class SupplierPayload(ORMBase):
    name: Name
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=2000)
    is_active: bool = True


class SupplierRead(SupplierPayload):
    id: int
    outstanding_amount: Decimal = Decimal(0)
    pending_count: int = 0
    period_outstanding_amount: Decimal = Decimal(0)
    period_pending_count: int = 0


class DebtItemPayload(ORMBase):
    name: Name
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Money


class DebtEntryPayload(ORMBase):
    supplier_id: int = Field(gt=0)
    kind: Literal["purchase", "increase", "decrease"]
    entry_date: date
    description: Description
    note: str | None = Field(default=None, max_length=2000)
    amount: Money | None = None
    items: list[DebtItemPayload] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_kind(self):
        if self.kind == "purchase":
            if not self.items:
                raise ValueError("Phiếu nhập cần ít nhất một mặt hàng")
        elif self.items or self.amount is None or self.amount <= 0:
            raise ValueError("Phiếu điều chỉnh cần số tiền lớn hơn 0 và không có dòng hàng")
        return self


class DebtEntryUpdate(DebtEntryPayload):
    expected_revision: int = Field(ge=0)


class DebtItemRead(DebtItemPayload):
    id: int
    line_total: Decimal


class DebtEntryRead(ORMBase):
    id: int
    code: str
    supplier_id: int
    supplier_name: str | None = None
    kind: str
    entry_date: date
    description: str
    note: str | None
    amount: Decimal
    signed_amount: Decimal
    revision: int
    payment_id: int | None
    cancelled_at: datetime | None
    items: list[DebtItemRead]
    created_at: datetime


class DebtEntryPage(ORMBase):
    items: list[DebtEntryRead]
    total: int
    page: int
    page_size: int
    total_increase: Decimal = Decimal(0)
    total_decrease: Decimal = Decimal(0)
    pending_amount: Decimal = Decimal(0)


class EntrySelection(ORMBase):
    id: int = Field(gt=0)
    revision: int = Field(ge=0)


class DebtPaymentPayload(ORMBase):
    supplier_id: int = Field(gt=0)
    entries: list[EntrySelection] = Field(min_length=1, max_length=500)
    expected_amount: Money
    paid_on: date
    method: Literal["cash", "transfer"] = "transfer"
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("entries")
    @classmethod
    def unique_entries(cls, value):
        if len({entry.id for entry in value}) != len(value):
            raise ValueError("Danh sách phiếu bị trùng")
        return value


class DebtPaymentRead(ORMBase):
    id: int
    code: str
    supplier_id: int
    supplier_name: str
    paid_on: date
    method: str
    amount: Decimal
    note: str | None
    created_by_name: str | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    entries: list[DebtEntryRead]
    created_at: datetime


class DebtPaymentPage(ORMBase):
    items: list[DebtPaymentRead]
    total: int
    page: int
    page_size: int


class DebtCancelPayload(ORMBase):
    reason: Description
    expected_revision: int = Field(default=0, ge=0)


class DebtHistoryRead(ORMBase):
    id: int
    entry_id: int | None
    payment_id: int | None
    action: str
    actor_name: str | None
    occurred_at: datetime
    details: dict
