from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import InvoiceStatus
from app.schemas.common import ORMBase
from app.schemas.customer import CustomerRead


class DashboardProductSummary(ORMBase):
    key: str
    name: str
    quantity: Decimal
    revenue: Decimal


class DashboardRevenuePoint(ORMBase):
    key: str
    label: str
    full_label: str
    value: Decimal
    show_label: bool


class DashboardRecentInvoice(ORMBase):
    id: int
    code: str
    customer: CustomerRead | None = None
    status: InvoiceStatus
    sold_at: datetime
    total_amount: Decimal


class DashboardSummary(ORMBase):
    period: str
    product_revenue: Decimal = Field(default=Decimal("0"))
    extra_charge_revenue: Decimal = Field(default=Decimal("0"))
    created_invoice_count: int
    created_customer_count: int
    revenue_chart: list[DashboardRevenuePoint]
    top_products_by_quantity: list[DashboardProductSummary]
    top_products_by_revenue: list[DashboardProductSummary]
    recent_invoices: list[DashboardRecentInvoice]
