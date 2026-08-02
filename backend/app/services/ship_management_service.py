from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.enums import InvoiceAuditLabel, InvoiceHistoryAction, InvoiceStatus
from app.models.invoice import Invoice
from app.models.shipper import Shipper
from app.models.user import User
from app.schemas.invoice import InvoiceBulkAuditAssign
from app.services import invoice_service
from app.services.shipping_service import VIETNAM_TIMEZONE, vietnam_day_utc_bounds


def unaudited_query():
    return (
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.items),
            selectinload(Invoice.extra_charges),
            selectinload(Invoice.assigned_shipper).selectinload(Shipper.user),
        )
        .where(
            Invoice.audit_label.is_(None),
            Invoice.status == InvoiceStatus.created,
            Invoice.deleted_at.is_(None),
        )
    )


def list_unaudited_invoices(
    db: Session,
    from_date: date | None,
    to_date: date | None,
) -> list[Invoice]:
    today = datetime.now(VIETNAM_TIMEZONE).date()
    effective_from = from_date or today
    effective_to = to_date or today
    if effective_from > effective_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu không được sau ngày kết thúc",
        )
    start_utc, _ = vietnam_day_utc_bounds(effective_from)
    _, end_utc = vietnam_day_utc_bounds(effective_to)
    query = unaudited_query().where(
        Invoice.created_at >= start_utc,
        Invoice.created_at < end_utc,
    )
    return list(db.scalars(query.order_by(Invoice.created_at, Invoice.id)).unique().all())


def handover_invoices(db: Session, payload: InvoiceBulkAuditAssign, current_user: User) -> list[Invoice]:
    unique_ids = list(dict.fromkeys(payload.invoice_ids))
    try:
        invoices = list(
            db.scalars(
                unaudited_query()
                .where(Invoice.id.in_(unique_ids))
                .order_by(Invoice.created_at, Invoice.id)
                .with_for_update()
            ).unique().all()
        )
        if len(invoices) != len(unique_ids):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Một hoặc nhiều đơn không còn ở trạng thái chưa audit. Không có đơn nào được bàn giao",
            )

        external = payload.external_handoff
        cod_total = sum(
            (invoice.total_amount for invoice in invoices if not invoice.is_paid_by_transfer),
            Decimal("0"),
        )
        external_advance_amount = cod_total - external.shipping_fee if external else Decimal("0")
        for invoice in invoices:
            before_data = invoice_service.snapshot_invoice(invoice)
            invoice.audit_label = payload.audit_label
            invoice.assigned_shipper_id = None
            invoice.audited_at = datetime.utcnow()
            invoice.audited_by_user_id = current_user.id
            if payload.audit_label == InvoiceAuditLabel.external_shipper and external:
                invoice.external_shipper_name = None
                invoice.external_shipper_phone = None
                invoice.external_advance_method = external.advance_method
                invoice.external_transfer_amount = external.transfer_amount
                invoice.external_cash_amount = external.cash_amount
                invoice.external_shipping_fee = external.shipping_fee
                invoice.external_advance_amount = external_advance_amount
                reason = "Bàn giao Ship Ngoài"
            else:
                invoice.external_shipper_name = None
                invoice.external_shipper_phone = None
                invoice.external_advance_method = None
                invoice.external_transfer_amount = Decimal("0")
                invoice.external_cash_amount = Decimal("0")
                invoice.external_shipping_fee = Decimal("0")
                invoice.external_advance_amount = Decimal("0")
                reason = "Đánh dấu đơn Khách lẻ"
            db.flush()
            invoice_service.add_history(
                db,
                invoice,
                InvoiceHistoryAction.updated,
                before_data=before_data,
                after_data=invoice_service.snapshot_invoice(invoice),
                user_id=current_user.id,
                user_name=current_user.display_name,
                reason=reason,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return [invoice_service.get_invoice(db, invoice.id) for invoice in invoices]
