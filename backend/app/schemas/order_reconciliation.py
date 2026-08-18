from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import ORMBase
from app.schemas.invoice import InvoiceRead
from app.schemas.external_handover import ExternalHandoverBatchRead
from app.models.enums import ExternalAdvanceMethod


class RetailInvoiceCollectCreate(ORMBase):
    note: str | None = Field(default=None, max_length=500)


class RetailInvoiceCollectionRead(ORMBase):
    id: int
    invoice_id: int
    invoice_code: str
    customer_name: str | None
    collected_amount: Decimal
    is_paid_by_transfer: bool
    collected_at: datetime
    collected_by_name: str | None
    note: str | None
    created_at: datetime
    updated_at: datetime


class RetailInvoiceReconciliationRead(ORMBase):
    invoice: InvoiceRead
    collection: RetailInvoiceCollectionRead | None


class ExternalHandoverReconcileCreate(ORMBase):
    note: str | None = Field(default=None, max_length=500)


class ExternalHandoverBatchReconciliationRead(ORMBase):
    id: int
    batch_id: int
    batch_code: str
    invoice_count: int
    expected_amount: Decimal
    received_amount: Decimal
    advance_method: ExternalAdvanceMethod
    reconciled_at: datetime
    reconciled_by_name: str | None
    note: str | None
    created_at: datetime
    updated_at: datetime


class ExternalHandoverReconciliationRowRead(ORMBase):
    batch: ExternalHandoverBatchRead
    reconciliation: ExternalHandoverBatchReconciliationRead | None
