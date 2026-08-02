from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.enums import InvoiceAuditLabel, InvoiceHistoryAction, InvoiceStatus
from app.models.invoice import Invoice
from app.models.shipper import Shipper
from app.models.user import User
from app.services import invoice_service, shipper_service


VIETNAM_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")


def vietnam_day_utc_bounds(target_date: date) -> tuple[datetime, datetime]:
    start_local = datetime.combine(target_date, time.min, tzinfo=VIETNAM_TIMEZONE)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, start_utc + timedelta(days=1)


def current_vietnam_day_utc_bounds() -> tuple[datetime, datetime]:
    return vietnam_day_utc_bounds(datetime.now(VIETNAM_TIMEZONE).date())


def available_invoice_query():
    start_utc, end_utc = current_vietnam_day_utc_bounds()
    return (
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.items),
            selectinload(Invoice.extra_charges),
            selectinload(Invoice.assigned_shipper).selectinload(Shipper.user),
        )
        .where(
            Invoice.created_at >= start_utc,
            Invoice.created_at < end_utc,
            Invoice.audit_label.is_(None),
            Invoice.status == InvoiceStatus.created,
            Invoice.deleted_at.is_(None),
        )
    )


def list_available_invoices(db: Session, current_user: User) -> list[Invoice]:
    shipper_service.get_current_shipper(db, current_user.id)
    return list(db.scalars(available_invoice_query().order_by(Invoice.created_at, Invoice.id)).unique().all())


def list_claimed_invoices(
    db: Session,
    from_date: date | None,
    to_date: date | None,
    current_user: User,
) -> list[Invoice]:
    shipper = shipper_service.get_current_shipper(db, current_user.id)
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu không được sau ngày kết thúc",
        )
    conditions = [
        Invoice.assigned_shipper_id == shipper.id,
        Invoice.audit_label == InvoiceAuditLabel.internal_shipper,
        Invoice.deleted_at.is_(None),
    ]
    if from_date:
        start_utc, _ = vietnam_day_utc_bounds(from_date)
        conditions.append(Invoice.audited_at >= start_utc)
    if to_date:
        _, end_utc = vietnam_day_utc_bounds(to_date)
        conditions.append(Invoice.audited_at < end_utc)
    query = (
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.items),
            selectinload(Invoice.extra_charges),
            selectinload(Invoice.assigned_shipper).selectinload(Shipper.user),
        )
        .where(*conditions)
        .order_by(Invoice.audited_at.desc(), Invoice.id.desc())
    )
    return list(db.scalars(query).unique().all())


def claim_invoices(db: Session, invoice_ids: list[int], current_user: User) -> list[Invoice]:
    shipper = shipper_service.get_current_shipper(db, current_user.id)
    unique_ids = list(dict.fromkeys(invoice_ids))
    try:
        invoices = list(
            db.scalars(
                available_invoice_query()
                .where(Invoice.id.in_(unique_ids))
                .order_by(Invoice.created_at, Invoice.id)
                .with_for_update()
            ).unique().all()
        )
        if len(invoices) != len(unique_ids):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Một hoặc nhiều đơn vừa được shipper khác nhận. Không có đơn nào trong lần chọn này được gán cho bạn",
            )
        for invoice in invoices:
            before_data = invoice_service.snapshot_invoice(invoice)
            invoice.audit_label = InvoiceAuditLabel.internal_shipper
            invoice.assigned_shipper_id = shipper.id
            invoice.audited_at = datetime.utcnow()
            invoice.audited_by_user_id = current_user.id
            db.flush()
            invoice_service.add_history(
                db,
                invoice,
                InvoiceHistoryAction.updated,
                before_data=before_data,
                after_data=invoice_service.snapshot_invoice(invoice),
                user_id=current_user.id,
                user_name=current_user.display_name,
                reason=f"Shipper {current_user.display_name} nhận đơn giao hàng",
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return [invoice_service.get_invoice(db, invoice.id) for invoice in invoices]


def mark_invoice_delivered(db: Session, invoice_id: int, current_user: User) -> Invoice:
    shipper = shipper_service.get_current_shipper(db, current_user.id)
    try:
        invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
        if not invoice or invoice.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hóa đơn không tồn tại")
        if invoice.assigned_shipper_id != shipper.id or invoice.audit_label != InvoiceAuditLabel.internal_shipper:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không được giao hóa đơn này")
        if invoice.status == InvoiceStatus.cancelled:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Hóa đơn đã hủy, không thể đánh dấu giao thành công")
        if invoice.delivered_at is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Hóa đơn đã được đánh dấu giao thành công")

        before_data = invoice_service.snapshot_invoice(invoice)
        invoice.status = InvoiceStatus.completed
        invoice.delivered_at = datetime.utcnow()
        invoice.delivered_by_user_id = current_user.id
        db.flush()
        invoice_service.add_history(
            db,
            invoice,
            InvoiceHistoryAction.updated,
            before_data=before_data,
            after_data=invoice_service.snapshot_invoice(invoice),
            user_id=current_user.id,
            user_name=current_user.display_name,
            reason=f"Shipper {current_user.display_name} xác nhận giao hàng thành công",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return invoice_service.get_invoice(db, invoice_id)
