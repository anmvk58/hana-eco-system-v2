from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import ProductStatus
from app.schemas.product_category import ProductCategoryRead
from app.schemas.common import ORMBase


class ProductBase(ORMBase):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=240)
    category_id: int | None = None
    unit: str = Field(min_length=1, max_length=40)
    sale_price: Decimal = Field(default=Decimal("0"), ge=0)
    cost_price: Decimal = Field(default=Decimal("0"), ge=0)
    stock_quantity: Decimal = Field(default=Decimal("0"))
    status: ProductStatus = ProductStatus.active


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ORMBase):
    code: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=240)
    category_id: int | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=40)
    sale_price: Decimal | None = Field(default=None, ge=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    stock_quantity: Decimal | None = None
    status: ProductStatus | None = None


class ProductRead(ProductBase):
    id: int
    category: ProductCategoryRead | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
