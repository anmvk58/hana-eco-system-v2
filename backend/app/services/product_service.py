from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.product import Product
from app.models.product_category import ProductCategory
from app.schemas.product import ProductCreate, ProductUpdate, QuickProductSelectionUpdate


def list_products(
    db: Session,
    search: str | None = None,
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[Product]:
    stmt = select(Product).options(selectinload(Product.category))
    if not include_deleted:
        stmt = stmt.where(Product.deleted_at.is_(None))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Product.code.ilike(term), Product.name.ilike(term)))
    stmt = stmt.order_by(Product.created_at.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def get_product(db: Session, product_id: int, include_deleted: bool = False) -> Product:
    stmt = select(Product).options(selectinload(Product.category)).where(Product.id == product_id)
    if not include_deleted:
        stmt = stmt.where(Product.deleted_at.is_(None))
    product = db.scalar(stmt)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


def validate_category(db: Session, category_id: int | None) -> None:
    if category_id is None:
        return
    category = db.scalar(select(ProductCategory).where(ProductCategory.id == category_id, ProductCategory.deleted_at.is_(None)))
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product category not found")


def create_product(db: Session, payload: ProductCreate) -> Product:
    validate_category(db, payload.category_id)
    product = Product(**payload.model_dump())
    db.add(product)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product code already exists") from exc
    db.refresh(product)
    return product


def update_product(db: Session, product_id: int, payload: ProductUpdate) -> Product:
    product = get_product(db, product_id)
    update_data = payload.model_dump(exclude_unset=True)
    if "category_id" in update_data:
        validate_category(db, update_data["category_id"])
    for field, value in update_data.items():
        setattr(product, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product code already exists") from exc
    db.refresh(product)
    return product


def soft_delete_product(db: Session, product_id: int) -> None:
    product = get_product(db, product_id)
    product.deleted_at = datetime.utcnow()
    db.commit()


def update_quick_product_selection(db: Session, payload: QuickProductSelectionUpdate) -> list[Product]:
    selected_ids = [product_id for product_id in payload.product_ids if product_id is not None]
    selected_products = list(db.scalars(
        select(Product)
        .where(
            Product.id.in_(selected_ids),
            Product.deleted_at.is_(None),
            Product.status == "active",
        )
        .with_for_update()
    ).all()) if selected_ids else []
    if len(selected_products) != len(selected_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Danh sách chọn nhanh có sản phẩm không tồn tại hoặc đã ngừng bán",
        )

    products_by_id = {product.id: product for product in selected_products}
    try:
        current_products = list(db.scalars(
            select(Product).where(Product.is_quick_select.is_(True)).with_for_update()
        ).all())
        for product in current_products:
            product.is_quick_select = False
            product.quick_select_order = 0
        for position, product_id in enumerate(payload.product_ids, start=1):
            if product_id is None:
                continue
            product = products_by_id[product_id]
            product.is_quick_select = True
            product.quick_select_order = position
        db.commit()
    except Exception:
        db.rollback()
        raise

    return list(db.scalars(
        select(Product)
        .options(selectinload(Product.category))
        .where(Product.id.in_(selected_ids))
        .order_by(Product.quick_select_order, Product.id)
    ).all()) if selected_ids else []
