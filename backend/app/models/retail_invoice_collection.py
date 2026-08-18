from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class RetailInvoiceCollection(Base, TimestampMixin):
    __tablename__ = "retail_invoice_collections"
    __table_args__ = (UniqueConstraint("invoice_id", name="uq_retail_collected_invoice"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True, nullable=False)
    invoice_code: Mapped[str] = mapped_column(String(60), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    collected_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    is_paid_by_transfer: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    collected_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoice = relationship("Invoice")
    collected_by_user = relationship("User")
