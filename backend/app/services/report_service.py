from datetime import date, datetime, time

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import ExtraChargeType, InvoiceStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceExtraCharge
from app.services.time_service import vietnam_date_conditions


def general_report(db: Session, from_date: date | None, to_date: date | None) -> dict:
    conditions = [
        Invoice.status.in_((InvoiceStatus.created, InvoiceStatus.completed)),
        Invoice.deleted_at.is_(None),
        *vietnam_date_conditions(Invoice.sold_at, from_date, to_date),
    ]
    summary = dict(db.execute(select(
        func.coalesce(func.sum(Invoice.total_amount), 0).label("revenue"),
        func.coalesce(func.sum(Invoice.subtotal), 0).label("subtotal"),
        func.coalesce(func.sum(Invoice.discount_amount), 0).label("discount"),
    ).where(*conditions)).mappings().one())
    summary["shipping"] = db.scalar(select(func.coalesce(func.sum(InvoiceExtraCharge.amount), 0))
        .join(Invoice, Invoice.id == InvoiceExtraCharge.invoice_id)
        .where(*conditions, InvoiceExtraCharge.charge_type == ExtraChargeType.shipping))

    # Preserve the latest invoice's product-name snapshot, as the old client report did.
    partition = InvoiceItem.product_code
    ranked = select(
        partition.label("key"), InvoiceItem.product_name.label("name"),
        func.sum(InvoiceItem.quantity).over(partition_by=partition).label("quantity"),
        func.sum(InvoiceItem.line_total).over(partition_by=partition).label("revenue"),
        func.row_number().over(partition_by=partition, order_by=(
            Invoice.created_at.desc(), Invoice.id.desc(), InvoiceItem.id.asc(),
        )).label("position"),
    ).join(Invoice, Invoice.id == InvoiceItem.invoice_id).where(*conditions).subquery()
    products = list(db.execute(select(ranked.c.key, ranked.c.name, ranked.c.quantity, ranked.c.revenue)
        .where(ranked.c.position == 1).order_by(ranked.c.revenue.desc(), ranked.c.key)).mappings().all())

    local_day = func.date(func.datetime(Invoice.sold_at, "+7 hours")) if db.get_bind().dialect.name == "sqlite" else func.date(func.convert_tz(Invoice.sold_at, "+00:00", "+07:00"))
    days = db.execute(select(local_day.label("day"), func.sum(Invoice.total_amount).label("revenue"))
        .where(*conditions).group_by(local_day).order_by(local_day)).mappings().all()
    return {"summary": summary, "products": products, "days": [dict(row, day=str(row["day"])) for row in days]}


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
