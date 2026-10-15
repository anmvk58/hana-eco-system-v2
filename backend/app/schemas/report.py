from decimal import Decimal

from app.schemas.common import ORMBase


class SoldProductReportRow(ORMBase):
    product_code: str
    product_name: str
    unit: str
    quantity_sold: Decimal
    sales_revenue: Decimal


class ReportSummary(ORMBase):
    revenue: Decimal
    subtotal: Decimal
    shipping: Decimal
    discount: Decimal


class ProductRevenueRead(ORMBase):
    key: str
    name: str
    quantity: Decimal
    revenue: Decimal


class DailyRevenueRead(ORMBase):
    day: str
    revenue: Decimal


class GeneralReportRead(ORMBase):
    summary: ReportSummary
    products: list[ProductRevenueRead]
    days: list[DailyRevenueRead]
