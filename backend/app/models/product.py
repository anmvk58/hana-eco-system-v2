from decimal import Decimal

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ProductStatus
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Product(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(240), index=True, nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("product_categories.id"), nullable=True, index=True)
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    sale_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    stock_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=0)
    status: Mapped[ProductStatus] = mapped_column(Enum(ProductStatus), default=ProductStatus.active, nullable=False)
    is_quick_select: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quick_select_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    category = relationship("ProductCategory", back_populates="products")
    invoice_items = relationship("InvoiceItem", back_populates="product")
