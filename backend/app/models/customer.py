from sqlalchemy import ForeignKey, String, Text, event, delete, insert, inspect
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.customer_search import name_search_suffixes


class Customer(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), unique=True, index=True, nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoices = relationship("Invoice", back_populates="customer")


class CustomerNameSearch(Base):
    __tablename__ = "customer_name_search"

    term: Mapped[str] = mapped_column(String(600), primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True, index=True)


@event.listens_for(Customer, "after_insert")
@event.listens_for(Customer, "after_update")
def sync_customer_name_search(mapper, connection, customer):
    if not (inspect(customer).attrs.name.history.has_changes() or inspect(customer).attrs.deleted_at.history.has_changes()):
        return
    connection.execute(delete(CustomerNameSearch).where(CustomerNameSearch.customer_id == customer.id))
    if customer.deleted_at is None:
        rows = [{"term": suffix, "customer_id": customer.id} for suffix in name_search_suffixes(customer.name)]
        if rows:
            connection.execute(insert(CustomerNameSearch), rows)

