from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ExternalAdvanceMethod
from app.models.mixins import TimestampMixin


class ExternalHandoverBatchReconciliation(Base, TimestampMixin):
    __tablename__ = "external_handover_batch_reconciliations"
    __table_args__ = (UniqueConstraint("batch_id", name="uq_external_handover_reconciled_batch"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("external_handover_batches.id"), index=True, nullable=False)
    batch_code: Mapped[str] = mapped_column(String(40), nullable=False)
    invoice_count: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    received_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    advance_method: Mapped[ExternalAdvanceMethod] = mapped_column(Enum(ExternalAdvanceMethod), nullable=False)
    reconciled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    reconciled_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    batch = relationship("ExternalHandoverBatch", back_populates="reconciliation")
    reconciled_by_user = relationship("User")
