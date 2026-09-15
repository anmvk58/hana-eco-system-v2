from datetime import datetime
from decimal import Decimal

from pydantic import Field, field_validator

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
    is_quick_select: bool = False
    quick_select_order: int = Field(default=0, ge=0)


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
    is_quick_select: bool | None = None
    quick_select_order: int | None = Field(default=None, ge=0)


class ProductRead(ProductBase):
    id: int
    category: ProductCategoryRead | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class QuickProductSelectionUpdate(ORMBase):
    product_ids: list[int | None] = Field(min_length=1, max_length=15)

    @field_validator("product_ids")
    @classmethod
    def product_ids_must_be_unique(cls, product_ids: list[int | None]) -> list[int | None]:
        selected_ids = [product_id for product_id in product_ids if product_id is not None]
        if len(selected_ids) != len(set(selected_ids)):
            raise ValueError("Mỗi sản phẩm chỉ được xuất hiện một lần trong danh sách chọn nhanh")
        return product_ids
