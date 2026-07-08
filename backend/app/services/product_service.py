from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate


def list_products(
    db: Session,
    search: str | None = None,
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[Product]:
    stmt = select(Product)
    if not include_deleted:
        stmt = stmt.where(Product.deleted_at.is_(None))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Product.code.ilike(term), Product.name.ilike(term)))
    stmt = stmt.order_by(Product.created_at.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def get_product(db: Session, product_id: int, include_deleted: bool = False) -> Product:
    stmt = select(Product).where(Product.id == product_id)
    if not include_deleted:
        stmt = stmt.where(Product.deleted_at.is_(None))
    product = db.scalar(stmt)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


def create_product(db: Session, payload: ProductCreate) -> Product:
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
    for field, value in payload.model_dump(exclude_unset=True).items():
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

