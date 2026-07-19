from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.product_category import ProductCategory
from app.schemas.product_category import ProductCategoryCreate, ProductCategoryUpdate


def list_categories(
    db: Session,
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = 200,
) -> list[ProductCategory]:
    stmt = select(ProductCategory)
    if not include_deleted:
        stmt = stmt.where(ProductCategory.deleted_at.is_(None))
    stmt = stmt.order_by(ProductCategory.name.asc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def get_category(db: Session, category_id: int, include_deleted: bool = False) -> ProductCategory:
    stmt = select(ProductCategory).where(ProductCategory.id == category_id)
    if not include_deleted:
        stmt = stmt.where(ProductCategory.deleted_at.is_(None))
    category = db.scalar(stmt)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product category not found")
    return category


def create_category(db: Session, payload: ProductCategoryCreate) -> ProductCategory:
    category = ProductCategory(**payload.model_dump())
    db.add(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product category already exists") from exc
    db.refresh(category)
    return category


def update_category(db: Session, category_id: int, payload: ProductCategoryUpdate) -> ProductCategory:
    category = get_category(db, category_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product category already exists") from exc
    db.refresh(category)
    return category


def soft_delete_category(db: Session, category_id: int) -> None:
    category = get_category(db, category_id)
    category.deleted_at = datetime.utcnow()
    db.commit()
