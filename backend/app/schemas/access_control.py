from datetime import datetime

from pydantic import Field, model_validator

from app.schemas.common import ORMBase


class PermissionRead(ORMBase):
    id: int
    code: str
    name: str
    module: str


class RoleSummary(ORMBase):
    id: int
    name: str


class RoleRead(ORMBase):
    id: int
    name: str
    description: str | None = None
    is_system: bool
    permissions: list[PermissionRead]
    created_at: datetime
    updated_at: datetime


class RolePayload(ORMBase):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    permission_codes: list[str] = Field(default_factory=list)


class UserSummary(ORMBase):
    id: int
    username: str
    display_name: str


class UserRead(UserSummary):
    is_active: bool
    roles: list[RoleSummary]
    permissions: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class UserPayload(ORMBase):
    username: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    display_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=4, max_length=128)
    is_active: bool = True
    role_ids: list[int] = Field(default_factory=list)


class UserUpdate(ORMBase):
    username: str | None = Field(default=None, min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    password: str | None = Field(default=None, min_length=4, max_length=128)
    is_active: bool | None = None
    role_ids: list[int] | None = None

    @model_validator(mode="after")
    def reject_empty_update(self):
        if not self.model_fields_set:
            raise ValueError("Cần ít nhất một trường để cập nhật")
        return self


class CurrentUserRead(UserRead):
    pass


class LoginPayload(ORMBase):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class LoginRead(ORMBase):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: CurrentUserRead
