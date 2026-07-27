from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.customer import Customer
from app.models.enums import InvoiceStatus
from app.models.invoice import Invoice, InvoiceItem
from app.schemas.dashboard import DashboardProductSummary, DashboardRevenuePoint, DashboardSummary


DashboardPeriod = Literal["today", "7days", "month", "year"]
VIETNAM_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")


def period_range(period: DashboardPeriod) -> tuple[datetime, datetime]:
    now = datetime.now(VIETNAM_TIMEZONE).replace(tzinfo=None)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "7days":
        start -= timedelta(days=6)
    elif period == "month":
        start -= timedelta(days=29)
    elif period == "year":
        month_index = start.year * 12 + start.month - 1 - 11
        start = start.replace(year=month_index // 12, month=month_index % 12 + 1, day=1)
    end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start, end


def add_months(value: datetime, months: int) -> datetime:
    month_index = value.year * 12 + value.month - 1 + months
    return value.replace(year=month_index // 12, month=month_index % 12 + 1, day=1)


def revenue_points(
    db: Session,
    period: DashboardPeriod,
    start: datetime,
    end: datetime,
) -> list[DashboardRevenuePoint]:
    bucket_format = "%H" if period == "today" else "%Y-%m" if period == "year" else "%Y-%m-%d"
    bucket = func.date_format(Invoice.sold_at, bucket_format)
    rows = db.execute(
        select(
            bucket.label("bucket"),
            func.coalesce(func.sum(Invoice.subtotal), 0).label("value"),
        )
        .where(
            Invoice.status == InvoiceStatus.created,
            Invoice.deleted_at.is_(None),
            Invoice.sold_at >= start,
            Invoice.sold_at <= end,
        )
        .group_by(bucket)
    ).mappings()
    totals = {row["bucket"]: row["value"] for row in rows}

    if period == "today":
        return [
            DashboardRevenuePoint(
                key=str(hour),
                label=f"{hour:02d}h",
                full_label=f"{hour:02d}:00 – {hour:02d}:59",
                value=totals.get(f"{hour:02d}", Decimal("0")),
                show_label=hour % 2 == 0 or hour == 23,
            )
            for hour in range(24)
        ]

    if period == "year":
        points = []
        for index in range(12):
            value = add_months(start, index)
            key = value.strftime("%Y-%m")
            points.append(
                DashboardRevenuePoint(
                    key=key,
                    label=f"T{value.month}",
                    full_label=f"Tháng {value.month}/{value.year}",
                    value=totals.get(key, Decimal("0")),
                    show_label=True,
                )
            )
        return points

    number_of_days = 7 if period == "7days" else 30
    points = []
    for index in range(number_of_days):
        value = start + timedelta(days=index)
        key = value.strftime("%Y-%m-%d")
        points.append(
            DashboardRevenuePoint(
                key=key,
                label=value.strftime("%d/%m"),
                full_label=f"Ngày {value.strftime('%d/%m/%Y')}",
                value=totals.get(key, Decimal("0")),
                show_label=number_of_days == 7 or index % 5 == 0 or index == number_of_days - 1,
            )
        )
    return points


def get_dashboard_summary(db: Session, period: DashboardPeriod) -> DashboardSummary:
    start, end = period_range(period)
    active_invoice_conditions = (
        Invoice.status == InvoiceStatus.created,
        Invoice.deleted_at.is_(None),
        Invoice.sold_at >= start,
        Invoice.sold_at <= end,
    )

    revenue = db.execute(
        select(
            func.coalesce(func.sum(Invoice.subtotal), 0).label("product_revenue"),
            func.coalesce(func.sum(Invoice.total_extra_charges), 0).label("extra_charge_revenue"),
        ).where(*active_invoice_conditions)
    ).mappings().one()

    created_invoice_count = db.scalar(
        select(func.count(Invoice.id)).where(
            Invoice.status == InvoiceStatus.created,
            Invoice.deleted_at.is_(None),
            Invoice.created_at >= start,
            Invoice.created_at <= end,
        )
    ) or 0
    created_customer_count = db.scalar(
        select(func.count(Customer.id)).where(
            Customer.deleted_at.is_(None),
            Customer.created_at >= start,
            Customer.created_at <= end,
        )
    ) or 0

    product_rows = list(
        db.execute(
            select(
                InvoiceItem.product_code.label("key"),
                func.max(InvoiceItem.product_name).label("name"),
                func.sum(InvoiceItem.quantity).label("quantity"),
                func.sum(InvoiceItem.line_total).label("revenue"),
            )
            .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
            .where(*active_invoice_conditions)
            .group_by(InvoiceItem.product_code)
        ).mappings()
    )
    products = [DashboardProductSummary(**row) for row in product_rows]
    top_by_quantity = sorted(products, key=lambda item: (-item.quantity, -item.revenue, item.key))[:10]
    top_by_revenue = sorted(products, key=lambda item: (-item.revenue, -item.quantity, item.key))[:10]

    recent_invoices = list(
        db.scalars(
            select(Invoice)
            .options(selectinload(Invoice.customer))
            .where(Invoice.deleted_at.is_(None))
            .order_by(Invoice.sold_at.desc(), Invoice.id.desc())
            .limit(6)
        ).all()
    )

    return DashboardSummary(
        period=period,
        product_revenue=revenue["product_revenue"],
        extra_charge_revenue=revenue["extra_charge_revenue"],
        created_invoice_count=created_invoice_count,
        created_customer_count=created_customer_count,
        revenue_chart=revenue_points(db, period, start, end),
        top_products_by_quantity=top_by_quantity,
        top_products_by_revenue=top_by_revenue,
        recent_invoices=recent_invoices,
    )
