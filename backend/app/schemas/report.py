from decimal import Decimal

from app.schemas.common import ORMBase


class SoldProductReportRow(ORMBase):
    product_code: str
    product_name: str
    unit: str
    quantity_sold: Decimal
    sales_revenue: Decimal
