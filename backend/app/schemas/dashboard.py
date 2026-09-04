from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import ORMBase


class DashboardProductSummary(ORMBase):
    key: str
    name: str
    quantity: Decimal
    revenue: Decimal


class DashboardCustomerSummary(ORMBase):
    customer_id: int
    name: str
    revenue: Decimal


class DashboardRevenuePoint(ORMBase):
    key: str
    label: str
    full_label: str
    value: Decimal
    show_label: bool


class DashboardCountSlice(ORMBase):
    key: str
    label: str
    value: int


class DashboardShipperOrderSummary(ORMBase):
    shipper_id: int
    name: str
    order_count: int


class DashboardOrderStatusCharts(ORMBase):
    from_date: date
    to_date: date
    audit_chart: list[DashboardCountSlice]
    internal_shipper_chart: list[DashboardShipperOrderSummary]
    reconciliation_chart: list[DashboardCountSlice]


class DashboardSummary(ORMBase):
    from_date: date
    to_date: date
    revenue_granularity: Literal["hour", "day", "month"]
    product_revenue: Decimal = Field(default=Decimal("0"))
    extra_charge_revenue: Decimal = Field(default=Decimal("0"))
    created_invoice_count: int
    revenue_chart: list[DashboardRevenuePoint]
