from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.models.enums import ExternalAdvanceMethod, InvoiceAuditLabel
from app.schemas.common import ORMBase
from app.schemas.invoice import ExternalHandoffCreate, InvoiceBulkAuditAssign


class AhamoveExternalHandoffCreate(ExternalHandoffCreate):
    @model_validator(mode="after")
    def validate_amounts(self):
        if self.advance_method == ExternalAdvanceMethod.transfer:
            if self.cash_amount != 0:
                raise ValueError("Chuyển khoản yêu cầu tiền mặt bằng 0")
            return self
        return super().validate_amounts()


class AhamoveHandover(InvoiceBulkAuditAssign):
    audit_label: Literal[InvoiceAuditLabel.external_shipper] = InvoiceAuditLabel.external_shipper
    external_handoff: AhamoveExternalHandoffCreate


class AhamoveBatchComplete(ORMBase):
    transfer_note: str | None = Field(default=None, max_length=1000)
    cash_note: str | None = Field(default=None, max_length=1000)
    expected_note: str | None = Field(max_length=2000)

    @field_validator("transfer_note", "cash_note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def require_payment_note(self):
        if not self.transfer_note and not self.cash_note:
            raise ValueError("Vui lòng nhập ít nhất một ghi chú Chuyển khoản hoặc Tiền mặt")
        return self
