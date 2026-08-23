from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.enums import ExternalHandoverBatchStatus, InvoiceAuditLabel, InvoiceStatus
from app.models.external_handover import ExternalHandoverBatch, ExternalHandoverBatchItem
from app.models.external_handover_reconciliation import ExternalHandoverBatchReconciliation
from app.models.internal_cod_collection import InternalCodCollectionItem
from app.models.invoice import Invoice, InvoiceItem
from app.models.retail_invoice_collection import RetailInvoiceCollection
from app.models.shipper import Shipper
from app.models.user import User
from app.schemas.dashboard import (
    DashboardCountSlice,
    DashboardProductSummary,
    DashboardRevenuePoint,
    DashboardShipperOrderSummary,
    DashboardSummary,
)
from app.services.time_service import vietnam_day_utc_bounds, vietnam_now_naive


def date_range(from_date: date | None, to_date: date | None) -> tuple[date, date, datetime, datetime]:
    today = vietnam_now_naive().date()
    selected_from = from_date or to_date or today
    selected_to = to_date or from_date or today
    if selected_from > selected_to:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc")
    start = datetime.combine(selected_from, time.min)
    end_exclusive = datetime.combine(selected_to + timedelta(days=1), time.min)
    return selected_from, selected_to, start, end_exclusive


def add_months(value: datetime, months: int) -> datetime:
    month_index = value.year * 12 + value.month - 1 + months
    return value.replace(year=month_index // 12, month=month_index % 12 + 1, day=1)


def revenue_points(
    db: Session,
    start_date: date,
    end_date: date,
    start: datetime,
    end_exclusive: datetime,
) -> tuple[str, list[DashboardRevenuePoint]]:
    number_of_days = (end_date - start_date).days + 1
    if number_of_days == 1:
        granularity = "hour"
        bucket_format = "%H"
    elif number_of_days <= 62:
        granularity = "day"
        bucket_format = "%Y-%m-%d"
    else:
        granularity = "month"
        bucket_format = "%Y-%m"

    bucket = func.date_format(Invoice.sold_at, bucket_format)
    rows = db.execute(
        select(bucket.label("bucket"), func.coalesce(func.sum(Invoice.subtotal), 0).label("value"))
        .where(
            Invoice.status.in_((InvoiceStatus.created, InvoiceStatus.completed)),
            Invoice.deleted_at.is_(None),
            Invoice.sold_at >= start,
            Invoice.sold_at < end_exclusive,
        )
        .group_by(bucket)
    ).mappings()
    totals = {row["bucket"]: row["value"] for row in rows}

    if granularity == "hour":
        return granularity, [
            DashboardRevenuePoint(
                key=str(hour), label=f"{hour:02d}h", full_label=f"{hour:02d}:00 – {hour:02d}:59",
                value=totals.get(f"{hour:02d}", Decimal("0")), show_label=hour % 2 == 0 or hour == 23,
            )
            for hour in range(24)
        ]

    if granularity == "month":
        first_month = start.replace(day=1)
        month_count = (end_date.year - start_date.year) * 12 + end_date.month - start_date.month + 1
        points = []
        for index in range(month_count):
            value = add_months(first_month, index)
            key = value.strftime("%Y-%m")
            points.append(DashboardRevenuePoint(
                key=key, label=f"T{value.month}/{str(value.year)[2:]}", full_label=f"Tháng {value.month}/{value.year}",
                value=totals.get(key, Decimal("0")),
                show_label=month_count <= 18 or index % 3 == 0 or index == month_count - 1,
            ))
        return granularity, points

    points = []
    for index in range(number_of_days):
        value = start + timedelta(days=index)
        key = value.strftime("%Y-%m-%d")
        points.append(DashboardRevenuePoint(
            key=key, label=value.strftime("%d/%m"), full_label=f"Ngày {value.strftime('%d/%m/%Y')}",
            value=totals.get(key, Decimal("0")),
            show_label=number_of_days <= 10 or index % 5 == 0 or index == number_of_days - 1,
        ))
    return granularity, points


def get_dashboard_summary(db: Session, from_date: date | None, to_date: date | None) -> DashboardSummary:
    selected_from, selected_to, start, end_exclusive = date_range(from_date, to_date)
    system_start = vietnam_day_utc_bounds(selected_from)[0]
    system_end = vietnam_day_utc_bounds(selected_to)[1]
    active_invoice_conditions = (
        Invoice.status.in_((InvoiceStatus.created, InvoiceStatus.completed)), Invoice.deleted_at.is_(None),
        Invoice.sold_at >= start, Invoice.sold_at < end_exclusive,
    )

    revenue = db.execute(select(
        func.coalesce(func.sum(Invoice.subtotal), 0).label("product_revenue"),
        func.coalesce(func.sum(Invoice.total_extra_charges), 0).label("extra_charge_revenue"),
    ).where(*active_invoice_conditions)).mappings().one()

    created_invoice_count = db.scalar(select(func.count(Invoice.id)).where(
        Invoice.status.in_((InvoiceStatus.created, InvoiceStatus.completed)), Invoice.deleted_at.is_(None),
        Invoice.created_at >= system_start, Invoice.created_at < system_end,
    )) or 0
    created_customer_count = db.scalar(select(func.count(Customer.id)).where(
        Customer.deleted_at.is_(None), Customer.created_at >= system_start, Customer.created_at < system_end,
    )) or 0

    product_rows = list(db.execute(select(
        InvoiceItem.product_code.label("key"), func.max(InvoiceItem.product_name).label("name"),
        func.sum(InvoiceItem.quantity).label("quantity"), func.sum(InvoiceItem.line_total).label("revenue"),
    ).join(Invoice, Invoice.id == InvoiceItem.invoice_id).where(*active_invoice_conditions)
      .group_by(InvoiceItem.product_code)).mappings())
    products = [DashboardProductSummary(**row) for row in product_rows]

    audit_totals = db.execute(select(
        func.coalesce(func.sum(case((Invoice.audit_label.is_not(None), 1), else_=0)), 0).label("audited"),
        func.coalesce(func.sum(case((Invoice.audit_label.is_(None), 1), else_=0)), 0).label("unaudited"),
    ).where(*active_invoice_conditions)).mappings().one()

    shipper_rows = db.execute(select(
        Shipper.id.label("shipper_id"), User.display_name.label("name"),
        func.count(Invoice.id).label("order_count"),
    ).select_from(Invoice).join(Shipper, Shipper.id == Invoice.assigned_shipper_id)
      .join(User, User.id == Shipper.user_id)
      .where(*active_invoice_conditions, Invoice.audit_label == InvoiceAuditLabel.internal_shipper)
      .group_by(Shipper.id, User.display_name)
      .order_by(func.count(Invoice.id).desc(), User.display_name.asc()).limit(10)).mappings()

    retail_collected = select(RetailInvoiceCollection.id).where(
        RetailInvoiceCollection.invoice_id == Invoice.id).exists()
    internal_cod_collected = select(InternalCodCollectionItem.id).where(
        InternalCodCollectionItem.invoice_id == Invoice.id).exists()
    external_batch_reconciled = select(ExternalHandoverBatchReconciliation.id).join(
        ExternalHandoverBatch, ExternalHandoverBatch.id == ExternalHandoverBatchReconciliation.batch_id
    ).join(ExternalHandoverBatchItem, ExternalHandoverBatchItem.batch_id == ExternalHandoverBatch.id).where(
        ExternalHandoverBatchItem.invoice_id == Invoice.id,
        ExternalHandoverBatchItem.is_active.is_(True),
        ExternalHandoverBatch.status == ExternalHandoverBatchStatus.active,
    ).exists()
    is_reconciled = or_(retail_collected, internal_cod_collected, external_batch_reconciled)
    reconciliation_totals = db.execute(select(
        func.coalesce(func.sum(case((is_reconciled, 1), else_=0)), 0).label("reconciled"),
        func.coalesce(func.sum(case((is_reconciled, 0), else_=1)), 0).label("unreconciled"),
    ).where(*active_invoice_conditions)).mappings().one()

    granularity, chart = revenue_points(db, selected_from, selected_to, start, end_exclusive)
    return DashboardSummary(
        from_date=selected_from, to_date=selected_to, revenue_granularity=granularity,
        product_revenue=revenue["product_revenue"], extra_charge_revenue=revenue["extra_charge_revenue"],
        created_invoice_count=created_invoice_count, created_customer_count=created_customer_count,
        revenue_chart=chart,
        top_products_by_quantity=sorted(products, key=lambda item: (-item.quantity, -item.revenue, item.key))[:10],
        top_products_by_revenue=sorted(products, key=lambda item: (-item.revenue, -item.quantity, item.key))[:10],
        audit_chart=[
            DashboardCountSlice(key="audited", label="Đã Audit", value=audit_totals["audited"]),
            DashboardCountSlice(key="unaudited", label="Chưa Audit", value=audit_totals["unaudited"]),
        ],
        internal_shipper_chart=[DashboardShipperOrderSummary(**row) for row in shipper_rows],
        reconciliation_chart=[
            DashboardCountSlice(key="reconciled", label="Đã kiểm kê", value=reconciliation_totals["reconciled"]),
            DashboardCountSlice(key="unreconciled", label="Chưa kiểm kê", value=reconciliation_totals["unreconciled"]),
        ],
    )
