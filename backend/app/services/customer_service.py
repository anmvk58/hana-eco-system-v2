from app.services.time_service import utc_now
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, union
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.customer import Customer, CustomerNameSearch
from app.customer_search import normalized_customer_name
from app.schemas.customer import CustomerCreate, CustomerUpdate


def customer_query(search: str | None, *, include_deleted: bool = False):
    stmt = select(Customer)
    if not include_deleted:
        stmt = stmt.where(Customer.deleted_at.is_(None))
    keyword = " ".join((search or "").split())
    if not keyword:
        return stmt
    phone = Customer.phone.startswith("".join(keyword.split()), autoescape=True)
    name = Customer.name.contains(keyword, autoescape=True)
    normalized = normalized_customer_name(keyword)
    if include_deleted or len(normalized) < 2:
        return stmt.where(or_(phone, name))
    # Every name suffix is indexed, so substring lookup becomes an indexed prefix
    # lookup. The original LIKE below verifies final results under DB collation.
    names = select(CustomerNameSearch.customer_id.label("id")).where(
        CustomerNameSearch.term.startswith(normalized, autoescape=True))
    ids = union(select(Customer.id).where(phone), names).subquery("customer_candidates")
    # MySQL otherwise chooses to scan all active customers for common words.
    # Drive this query from the indexed candidate IDs and look up customers by PK.
    return stmt.select_from(ids).join(Customer, Customer.id == ids.c.id)\
        .where(or_(phone, name)).prefix_with("STRAIGHT_JOIN", dialect="mysql")


def list_customers(
    db: Session,
    search: str | None = None,
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[Customer]:
    stmt = customer_query(search, include_deleted=include_deleted)
    stmt = stmt.order_by(Customer.created_at.desc(), Customer.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def list_customers_page(
    db: Session,
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> dict:
    stmt = customer_query(search)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt
        .order_by(Customer.created_at.desc(), Customer.id.desc())
        .offset(skip).limit(limit)
    ).all()
    return {"items": list(items), "total": total, "skip": skip, "limit": limit}


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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mã khách hàng hoặc số điện thoại đã tồn tại") from exc
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mã khách hàng hoặc số điện thoại đã tồn tại") from exc
    db.refresh(customer)
    return customer


def soft_delete_customer(db: Session, customer_id: int) -> None:
    customer = get_customer(db, customer_id)
    customer.deleted_at = utc_now()
    db.commit()
