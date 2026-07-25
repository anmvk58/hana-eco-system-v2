from datetime import datetime

import re

from pydantic import Field, field_validator

from app.schemas.common import ORMBase


class CustomerBase(ORMBase):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    note: str | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value):
        if value is None:
            return None
        normalized = re.sub(r"\s+", "", str(value))
        return normalized or None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(ORMBase):
    code: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    note: str | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value):
        if value is None:
            return None
        normalized = re.sub(r"\s+", "", str(value))
        return normalized or None


class CustomerRead(CustomerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

