from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field, field_validator, model_validator

from app.models.enums import ExternalAdvanceMethod, ExtraChargeType, InvoiceAuditLabel, InvoiceHistoryAction, InvoiceStatus
from app.schemas.common import ORMBase
from app.schemas.customer import CustomerRead
from app.schemas.shipper import ShipperRead


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
    status: InvoiceStatus = InvoiceStatus.created
    sold_at: datetime | None = None
    is_paid_by_transfer: bool = False
    note: str | None = None
    items: list[InvoiceItemCreate] = Field(min_length=1)
    extra_charges: list[InvoiceExtraChargeCreate] = Field(default_factory=list)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    reason: str | None = Field(default=None, description="Ghi chú lý do tạo/sửa, sẽ lưu vào invoice_history.")


class InvoiceUpdate(ORMBase):
    customer_id: int | None = None
    status: InvoiceStatus = InvoiceStatus.created
    sold_at: datetime | None = None
    is_paid_by_transfer: bool | None = None
    note: str | None = None
    items: list[InvoiceItemCreate] = Field(min_length=1)
    extra_charges: list[InvoiceExtraChargeCreate] = Field(default_factory=list)
    discount_amount: Decimal | None = Field(default=None, ge=0)
    reason: str | None = Field(default=None, description="Ghi chú lý do sửa, sẽ lưu vào invoice_history.")

    @model_validator(mode="after")
    def validate_invoice_update(self):
        return self


class InvoiceCancel(ORMBase):
    reason: str = Field(min_length=1, max_length=500)


class InvoiceAuditAssign(ORMBase):
    audit_label: InvoiceAuditLabel

    @model_validator(mode="after")
    def reject_internal_shipper_label(self):
        if self.audit_label == InvoiceAuditLabel.internal_shipper:
            raise ValueError("Nhãn Ship Ruột chỉ được gán khi shipper nhận đơn")
        return self


class InvoiceAuditRollback(ORMBase):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Vui lòng nhập lý do hoàn tác")
        return normalized


class InvoiceClaim(ORMBase):
    invoice_ids: list[int] = Field(min_length=1, max_length=100)


class InternalShipperHandover(ORMBase):
    invoice_ids: list[int] = Field(min_length=1, max_length=100)
    shipper_id: int = Field(gt=0)


class InternalShipperRecall(ORMBase):
    reason: str | None = Field(default=None, max_length=500)


class ExternalHandoffCreate(ORMBase):
    advance_method: ExternalAdvanceMethod
    shipping_fee: Decimal = Field(ge=0)
    transfer_amount: Decimal = Field(default=Decimal("0"), ge=0)
    cash_amount: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="after")
    def validate_amounts(self):
        if self.advance_method == ExternalAdvanceMethod.transfer and (self.transfer_amount <= 0 or self.cash_amount != 0):
            raise ValueError("Chuyển khoản yêu cầu số tiền chuyển khoản lớn hơn 0 và tiền mặt bằng 0")
        if self.advance_method == ExternalAdvanceMethod.cash and (self.cash_amount <= 0 or self.transfer_amount != 0):
            raise ValueError("Tiền mặt yêu cầu số tiền mặt lớn hơn 0 và chuyển khoản bằng 0")
        if self.advance_method == ExternalAdvanceMethod.mixed and (self.transfer_amount <= 0 or self.cash_amount <= 0):
            raise ValueError("Hình thức kết hợp yêu cầu cả tiền chuyển khoản và tiền mặt lớn hơn 0")
        return self


class InvoiceBulkAuditAssign(ORMBase):
    invoice_ids: list[int] = Field(min_length=1, max_length=100)
    audit_label: InvoiceAuditLabel
    external_handoff: ExternalHandoffCreate | None = None

    @model_validator(mode="after")
    def validate_handover(self):
        if self.audit_label == InvoiceAuditLabel.internal_shipper:
            raise ValueError("Không thể bàn giao Ship Ruột từ màn hình quản lý")
        if self.audit_label == InvoiceAuditLabel.external_shipper and self.external_handoff is None:
            raise ValueError("Vui lòng nhập thông tin ứng tiền")
        if self.audit_label == InvoiceAuditLabel.retail and self.external_handoff is not None:
            raise ValueError("Đơn khách lẻ không cần thông tin shipper ngoài")
        return self


class InvoiceRead(ORMBase):
    id: int
    code: str
    revision: int
    customer_id: int | None
    customer: CustomerRead | None = None
    status: InvoiceStatus
    sold_at: datetime
    audit_label: InvoiceAuditLabel | None
    assigned_shipper_id: int | None
    assigned_shipper: ShipperRead | None = None
    audited_at: datetime | None
    audited_by_user_id: int | None
    delivered_at: datetime | None
    delivered_by_user_id: int | None
    is_paid_by_transfer: bool
    external_shipper_name: str | None
    external_shipper_phone: str | None
    external_advance_method: ExternalAdvanceMethod | None
    external_transfer_amount: Decimal
    external_cash_amount: Decimal
    external_shipping_fee: Decimal
    external_advance_amount: Decimal
    note: str | None
    subtotal: Decimal
    total_extra_charges: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    items: list[InvoiceItemRead]
    extra_charges: list[InvoiceExtraChargeRead]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class InternalShipperAssignmentRead(ORMBase):
    invoice: InvoiceRead
    can_recall: bool
    recall_block_reason: str | None


class InvoiceListItemRead(InvoiceRead):
    is_edited: bool


class InvoicePage(ORMBase):
    items: list[InvoiceListItemRead]
    total: int
    page: int
    page_size: int
    total_pages: int


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

