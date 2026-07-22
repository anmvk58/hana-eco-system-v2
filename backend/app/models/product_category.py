from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class ProductCategory(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "product_categories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    products = relationship("Product", back_populates="category")
