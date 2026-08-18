from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import ExternalAdvanceMethod, ExternalHandoverBatchStatus
from app.schemas.common import ORMBase
from app.schemas.invoice import ExternalHandoffCreate, InvoiceRead


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
