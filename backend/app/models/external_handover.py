from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ExternalAdvanceMethod, ExternalHandoverBatchStatus
from app.models.mixins import TimestampMixin


class ExternalHandoverBatch(Base, TimestampMixin):
    __tablename__ = "external_handover_batches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    status: Mapped[ExternalHandoverBatchStatus] = mapped_column(
        Enum(ExternalHandoverBatchStatus), default=ExternalHandoverBatchStatus.active, index=True, nullable=False
    )
    handed_over_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    advance_method: Mapped[ExternalAdvanceMethod] = mapped_column(Enum(ExternalAdvanceMethod), nullable=False)
    transfer_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    cash_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    advance_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    cancelled_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    updated_by_user = relationship("User", foreign_keys=[updated_by_user_id])
    cancelled_by_user = relationship("User", foreign_keys=[cancelled_by_user_id])
    items = relationship("ExternalHandoverBatchItem", back_populates="batch", cascade="all, delete-orphan")
    reconciliation = relationship(
        "ExternalHandoverBatchReconciliation",
        back_populates="batch",
        uselist=False,
    )


class ExternalHandoverBatchItem(Base):
    __tablename__ = "external_handover_batch_items"
    __table_args__ = (UniqueConstraint("batch_id", "invoice_id", name="uq_external_batch_invoice"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("external_handover_batches.id", ondelete="CASCADE"), index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    added_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    removed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    batch = relationship("ExternalHandoverBatch", back_populates="items")
    invoice = relationship("Invoice")
    added_by_user = relationship("User", foreign_keys=[added_by_user_id])
    removed_by_user = relationship("User", foreign_keys=[removed_by_user_id])
