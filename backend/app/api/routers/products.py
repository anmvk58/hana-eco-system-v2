from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import require_any_permission, require_permission
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services import product_service


router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductRead], dependencies=[Depends(require_any_permission("products.view", "invoices.create", "invoices.update", "dashboard.view"))])
def list_products(
    search: str | None = Query(default=None, description="Tìm theo mã hoặc tên sản phẩm"),
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    return product_service.list_products(db, search, include_deleted, skip, limit)


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("products.create"))])
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    return product_service.create_product(db, payload)


@router.get("/{product_id}", response_model=ProductRead, dependencies=[Depends(require_permission("products.view"))])
def get_product(product_id: int, db: Session = Depends(get_db)):
    return product_service.get_product(db, product_id)


@router.put("/{product_id}", response_model=ProductRead, dependencies=[Depends(require_permission("products.update"))])
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    return product_service.update_product(db, product_id, payload)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("products.delete"))])
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product_service.soft_delete_product(db, product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

