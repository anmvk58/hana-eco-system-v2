from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.product_category import ProductCategoryCreate, ProductCategoryRead, ProductCategoryUpdate
from app.services import product_category_service


router = APIRouter(prefix="/product-categories", tags=["product-categories"])


@router.get("", response_model=list[ProductCategoryRead])
def list_categories(
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = Query(default=200, le=500),
    db: Session = Depends(get_db),
):
    return product_category_service.list_categories(db, include_deleted, skip, limit)


@router.post("", response_model=ProductCategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(payload: ProductCategoryCreate, db: Session = Depends(get_db)):
    return product_category_service.create_category(db, payload)


@router.get("/{category_id}", response_model=ProductCategoryRead)
def get_category(category_id: int, db: Session = Depends(get_db)):
    return product_category_service.get_category(db, category_id)


@router.put("/{category_id}", response_model=ProductCategoryRead)
def update_category(category_id: int, payload: ProductCategoryUpdate, db: Session = Depends(get_db)):
    return product_category_service.update_category(db, category_id, payload)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    product_category_service.soft_delete_category(db, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
