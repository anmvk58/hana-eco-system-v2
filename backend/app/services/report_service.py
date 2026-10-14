from datetime import date, datetime, time

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import InvoiceStatus
from app.models.invoice import Invoice, InvoiceItem
from app.services.time_service import vietnam_date_conditions


def sold_products(db: Session, from_date: date | None, to_date: date | None):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Từ ngày không được lớn hơn đến ngày")

    stmt = (
        select(
            InvoiceItem.product_code.label("product_code"),
            func.max(InvoiceItem.product_name).label("product_name"),
            func.max(InvoiceItem.unit).label("unit"),
            func.sum(InvoiceItem.quantity).label("quantity_sold"),
            func.sum(InvoiceItem.line_total).label("sales_revenue"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .where(Invoice.status.in_((InvoiceStatus.created, InvoiceStatus.completed)), Invoice.deleted_at.is_(None))
        .group_by(InvoiceItem.product_code)
        .order_by(func.sum(InvoiceItem.quantity).desc(), InvoiceItem.product_code)
    )
    stmt = stmt.where(*vietnam_date_conditions(Invoice.sold_at, from_date, to_date))
    return list(db.execute(stmt).mappings().all())
