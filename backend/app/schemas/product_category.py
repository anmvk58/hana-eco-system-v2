from datetime import datetime

from pydantic import Field

from app.schemas.common import ORMBase


class ProductCategoryBase(ORMBase):
    name: str = Field(min_length=1, max_length=160)
    note: str | None = None


class ProductCategoryCreate(ProductCategoryBase):
    pass


class ProductCategoryUpdate(ORMBase):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    note: str | None = None


class ProductCategoryRead(ProductCategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
