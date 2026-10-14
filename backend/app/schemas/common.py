from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_serializer


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", when_used="json", check_fields=False)
    def serialize_datetime(self, value):
        if isinstance(value, datetime):
            aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
            return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        return value


class SoftDeleteFields(ORMBase):
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
