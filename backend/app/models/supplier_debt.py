"""Standalone supplier ledger. Deliberately has no product/inventory relations."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Supplier(Base, TimestampMixin):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(String(500))
    note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SupplierDebtEntry(Base, TimestampMixin):
    __tablename__ = "supplier_debt_entries"
    __table_args__ = (Index("ix_supplier_debt_pending", "supplier_id", "cancelled_at", "payment_id", "entry_date"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    kind: Mapped[str] = mapped_column(String(20))
    entry_date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    note: Mapped[str | None] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(default=0)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_debt_payments.id"), index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    supplier = relationship("Supplier")
    items = relationship("SupplierDebtItem", cascade="all, delete-orphan", order_by="SupplierDebtItem.id")


class SupplierDebtItem(Base):
    __tablename__ = "supplier_debt_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("supplier_debt_entries.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))


class SupplierDebtPayment(Base, TimestampMixin):
    __tablename__ = "supplier_debt_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    supplier_name: Mapped[str] = mapped_column(String(200))
    paid_on: Mapped[date] = mapped_column(Date)
    method: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    note: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancel_reason: Mapped[str | None] = mapped_column(String(500))
    # Immutable snapshots survive undo and later edits/re-settlement of entries.
    entries_snapshot: Mapped[list] = mapped_column(JSON)
    created_by_user = relationship("User")


class SupplierDebtHistory(Base):
    __tablename__ = "supplier_debt_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    entry_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_debt_entries.id"), index=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_debt_payments.id"), index=True)
    action: Mapped[str] = mapped_column(String(40))
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    actor_name: Mapped[str | None] = mapped_column(String(200))
    occurred_at: Mapped[datetime] = mapped_column(DateTime)
    details: Mapped[dict] = mapped_column(JSON)
