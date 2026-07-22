from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Customer(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), index=True, nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoices = relationship("Invoice", back_populates="customer")

