from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class PaymentNoteSetting(Base, TimestampMixin):
    __tablename__ = "payment_note_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    notes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
