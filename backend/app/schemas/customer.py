from datetime import datetime

from pydantic import Field

from app.schemas.common import ORMBase


class CustomerBase(ORMBase):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    note: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(ORMBase):
    code: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    note: str | None = None


class CustomerRead(CustomerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

