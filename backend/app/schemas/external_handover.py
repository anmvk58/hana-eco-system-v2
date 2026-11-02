from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import Field, field_validator

from app.models.enums import ExternalAdvanceMethod, ExternalHandoverBatchStatus
from app.schemas.common import ORMBase
from app.schemas.invoice import ExternalHandoffCreate, InvoiceRead


class ExternalHandoverBatchNoteUpdate(ORMBase):
    note: str | None = Field(max_length=2000)
    expected_note: str | None = Field(max_length=2000)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class ExternalHandoverBatchUpdate(ORMBase):
    invoice_ids: list[int] = Field(min_length=1, max_length=100)
    external_handoff: ExternalHandoffCreate


class ExternalHandoverBatchItemRead(ORMBase):
    id: int
    invoice_id: int
    is_active: bool
    added_at: datetime
    removed_at: datetime | None
    invoice: InvoiceRead


class ExternalHandoverBatchRead(ORMBase):
    id: int
    code: str
    note: str | None = None
    transfer_note: str | None = None
    cash_note: str | None = None
    handover_status: Literal["created", "completed"] = "created"
    completed_at: datetime | None = None
    completed_by_user_id: int | None = None
    status: ExternalHandoverBatchStatus
    handed_over_at: datetime
    advance_method: ExternalAdvanceMethod
    transfer_amount: Decimal
    cash_amount: Decimal
    shipping_fee: Decimal
    advance_amount: Decimal
    created_by_name: str | None
    updated_by_name: str | None
    cancelled_at: datetime | None
    cancelled_by_name: str | None
    is_reconciled: bool
    items: list[ExternalHandoverBatchItemRead]
    created_at: datetime
    updated_at: datetime
