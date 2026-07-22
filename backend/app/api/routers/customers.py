from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import require_any_permission, require_permission
from app.schemas.customer import CustomerCreate, CustomerRead, CustomerUpdate
from app.services import customer_service


router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerRead], dependencies=[Depends(require_any_permission("customers.view", "invoices.create", "invoices.update", "dashboard.view"))])
def list_customers(
    search: str | None = Query(default=None, description="Tìm theo tên hoặc số điện thoại"),
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    return customer_service.list_customers(db, search, include_deleted, skip, limit)


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("customers.create"))])
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    return customer_service.create_customer(db, payload)


@router.get("/{customer_id}", response_model=CustomerRead, dependencies=[Depends(require_permission("customers.view"))])
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    return customer_service.get_customer(db, customer_id)


@router.put("/{customer_id}", response_model=CustomerRead, dependencies=[Depends(require_permission("customers.update"))])
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)):
    return customer_service.update_customer(db, customer_id, payload)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("customers.delete"))])
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer_service.soft_delete_customer(db, customer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

