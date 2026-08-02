from datetime import datetime

from pydantic import Field, model_validator

from app.schemas.access_control import UserSummary
from app.schemas.common import ORMBase


class ShipperCreate(ORMBase):
    username: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    display_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=4, max_length=128)
    phone: str | None = Field(default=None, max_length=30)
    note: str | None = None
    is_active: bool = True


class ShipperUpdate(ORMBase):
    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    password: str | None = Field(default=None, min_length=4, max_length=128)
    phone: str | None = Field(default=None, max_length=30)
    note: str | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def reject_empty_update(self):
        if not self.model_fields_set:
            raise ValueError("Cần ít nhất một trường để cập nhật")
        return self


class ShipperRead(ORMBase):
    id: int
    user_id: int
    user: UserSummary
    phone: str | None
    note: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
