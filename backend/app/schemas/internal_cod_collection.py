from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import ORMBase
from app.schemas.shipper import ShipperRead


class InternalCodCollectionCreate(ORMBase):
    shipper_id: int = Field(gt=0)
    collection_date: date
    invoice_ids: list[int] = Field(min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=500)


class PendingInternalCodInvoiceRead(ORMBase):
    id: int
    code: str
    customer_name: str | None
    handed_over_at: datetime | None
    total_amount: Decimal
    is_paid_by_transfer: bool
    is_cod_pending: bool


class InternalCodShipperSummaryRead(ORMBase):
    shipper: ShipperRead
    handed_over_invoice_count: int
    cod_invoice_count: int
    transfer_invoice_count: int
    pending_invoice_count: int
    pending_cod_amount: Decimal
    last_collection_at: datetime | None
    pending_invoices: list[PendingInternalCodInvoiceRead]
    handed_over_invoices: list[PendingInternalCodInvoiceRead]


class InternalCodCollectionItemRead(ORMBase):
    id: int
    invoice_id: int
    invoice_code: str
    customer_name: str | None
    cod_amount: Decimal
    handed_over_at: datetime | None
    delivered_at: datetime | None


class InternalCodCollectionSessionRead(ORMBase):
    id: int
    code: str
    shipper_id: int
    shipper_name: str
    invoice_count: int
    total_amount: Decimal
    collected_at: datetime
    collected_by_name: str | None
    note: str | None
    items: list[InternalCodCollectionItemRead]
    created_at: datetime
    updated_at: datetime
