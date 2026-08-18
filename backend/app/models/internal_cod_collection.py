from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class InternalCodCollectionSession(Base, TimestampMixin):
    __tablename__ = "internal_cod_collection_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    shipper_id: Mapped[int] = mapped_column(ForeignKey("shippers.id"), index=True, nullable=False)
    invoice_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    collected_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    shipper = relationship("Shipper")
    collected_by_user = relationship("User")
    items = relationship(
        "InternalCodCollectionItem",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="InternalCodCollectionItem.id",
    )


class InternalCodCollectionItem(Base):
    __tablename__ = "internal_cod_collection_items"
    __table_args__ = (UniqueConstraint("invoice_id", name="uq_internal_cod_collected_invoice"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("internal_cod_collection_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True, nullable=False)
    invoice_code: Mapped[str] = mapped_column(String(60), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cod_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    handed_over_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    session = relationship("InternalCodCollectionSession", back_populates="items")
    invoice = relationship("Invoice")
