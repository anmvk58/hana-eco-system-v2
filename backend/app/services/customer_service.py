from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate


def list_customers(
    db: Session,
    search: str | None = None,
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[Customer]:
    stmt = select(Customer)
    if not include_deleted:
        stmt = stmt.where(Customer.deleted_at.is_(None))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Customer.name.ilike(term), Customer.phone.ilike(term)))
    stmt = stmt.order_by(Customer.created_at.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def get_customer(db: Session, customer_id: int, include_deleted: bool = False) -> Customer:
    stmt = select(Customer).where(Customer.id == customer_id)
    if not include_deleted:
        stmt = stmt.where(Customer.deleted_at.is_(None))
    customer = db.scalar(stmt)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


def create_customer(db: Session, payload: CustomerCreate) -> Customer:
    customer = Customer(**payload.model_dump())
    db.add(customer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer code already exists") from exc
    db.refresh(customer)
    return customer


def update_customer(db: Session, customer_id: int, payload: CustomerUpdate) -> Customer:
    customer = get_customer(db, customer_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer code already exists") from exc
    db.refresh(customer)
    return customer


def soft_delete_customer(db: Session, customer_id: int) -> None:
    customer = get_customer(db, customer_id)
    customer.deleted_at = datetime.utcnow()
    db.commit()

