from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.enums import InvoiceAuditLabel, InvoiceStatus
from app.models.internal_cod_collection import InternalCodCollectionItem, InternalCodCollectionSession
from app.models.invoice import Invoice
from app.models.shipper import Shipper
from app.models.user import User
from app.schemas.internal_cod_collection import InternalCodCollectionCreate
from app.services.time_service import VIETNAM_TIMEZONE, vietnam_day_utc_bounds


def pending_invoice_conditions():
    already_collected = exists(
        select(InternalCodCollectionItem.id).where(InternalCodCollectionItem.invoice_id == Invoice.id)
    )
    return (
        Invoice.audit_label == InvoiceAuditLabel.internal_shipper,
        Invoice.assigned_shipper_id.is_not(None),
        Invoice.audited_at.is_not(None),
        Invoice.status != InvoiceStatus.cancelled,
        Invoice.is_paid_by_transfer.is_(False),
        Invoice.deleted_at.is_(None),
        ~already_collected,
    )


def pending_invoice_query(collection_date: date | None = None):
    query = (
        select(Invoice)
        .options(selectinload(Invoice.customer))
        .where(*pending_invoice_conditions())
    )
    if collection_date:
        start_utc, end_utc = vietnam_day_utc_bounds(collection_date)
        query = query.where(Invoice.audited_at >= start_utc, Invoice.audited_at < end_utc)
    return query


def list_shipper_summaries(db: Session, collection_date: date | None) -> list[dict]:
    effective_date = collection_date or datetime.now(VIETNAM_TIMEZONE).date()
    start_utc, end_utc = vietnam_day_utc_bounds(effective_date)
    shippers = list(db.scalars(
        select(Shipper)
        .options(selectinload(Shipper.user))
        .order_by(Shipper.is_active.desc(), Shipper.id.desc())
    ).all())
    pending_invoices = list(db.scalars(
        pending_invoice_query(effective_date).order_by(Invoice.audited_at, Invoice.id)
    ).all())
    pending_by_shipper: dict[int, list[Invoice]] = {}
    for invoice in pending_invoices:
        pending_by_shipper.setdefault(invoice.assigned_shipper_id, []).append(invoice)

    handed_over_invoices = list(db.scalars(
        select(Invoice).options(selectinload(Invoice.customer)).where(
            Invoice.audit_label == InvoiceAuditLabel.internal_shipper,
            Invoice.assigned_shipper_id.is_not(None),
            Invoice.audited_at.is_not(None),
            Invoice.status != InvoiceStatus.cancelled,
            Invoice.deleted_at.is_(None),
            Invoice.audited_at >= start_utc,
            Invoice.audited_at < end_utc,
        ).order_by(Invoice.audited_at, Invoice.id)
    ).all())
    handed_over_by_shipper: dict[int, list[Invoice]] = {}
    for invoice in handed_over_invoices:
        handed_over_by_shipper.setdefault(invoice.assigned_shipper_id, []).append(invoice)

    last_collections = dict(db.execute(
        select(
            InternalCodCollectionSession.shipper_id,
            func.max(InternalCodCollectionSession.collected_at),
        ).group_by(InternalCodCollectionSession.shipper_id)
    ).all())

    summaries = []
    for shipper in shippers:
        pending = pending_by_shipper.get(shipper.id, [])
        if not pending:
            continue
        handed_over = handed_over_by_shipper.get(shipper.id, [])
        cod_invoices = [invoice for invoice in handed_over if not invoice.is_paid_by_transfer]
        pending_ids = {invoice.id for invoice in pending}
        summaries.append({
            "shipper": shipper,
            "handed_over_invoice_count": len(handed_over),
            "cod_invoice_count": len(cod_invoices),
            "transfer_invoice_count": len(handed_over) - len(cod_invoices),
            "pending_invoice_count": len(pending),
            "pending_cod_amount": sum((invoice.total_amount for invoice in pending), Decimal("0")),
            "last_collection_at": last_collections.get(shipper.id),
            "pending_invoices": [
                {
                    "id": invoice.id,
                    "code": invoice.code,
                    "customer_name": invoice.customer.name if invoice.customer else None,
                    "handed_over_at": invoice.audited_at,
                    "total_amount": invoice.total_amount,
                    "is_paid_by_transfer": False,
                    "is_cod_pending": True,
                }
                for invoice in pending
            ],
            "handed_over_invoices": [
                {
                    "id": invoice.id,
                    "code": invoice.code,
                    "customer_name": invoice.customer.name if invoice.customer else None,
                    "handed_over_at": invoice.audited_at,
                    "total_amount": invoice.total_amount,
                    "is_paid_by_transfer": invoice.is_paid_by_transfer,
                    "is_cod_pending": invoice.id in pending_ids,
                }
                for invoice in handed_over
            ],
        })
    return summaries


def session_query():
    return select(InternalCodCollectionSession).options(
        selectinload(InternalCodCollectionSession.shipper).selectinload(Shipper.user),
        selectinload(InternalCodCollectionSession.collected_by_user),
        selectinload(InternalCodCollectionSession.items),
    )


def serialize_session(session: InternalCodCollectionSession) -> dict:
    return {
        "id": session.id,
        "code": session.code,
        "shipper_id": session.shipper_id,
        "shipper_name": session.shipper.user.display_name,
        "invoice_count": session.invoice_count,
        "total_amount": session.total_amount,
        "collected_at": session.collected_at,
        "collected_by_name": session.collected_by_user.display_name if session.collected_by_user else None,
        "note": session.note,
        "items": session.items,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }


def list_sessions(
    db: Session,
    from_date: date | None,
    to_date: date | None,
    shipper_id: int | None,
) -> list[dict]:
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc")
    conditions = []
    if from_date:
        start_utc, _ = vietnam_day_utc_bounds(from_date)
        conditions.append(InternalCodCollectionSession.collected_at >= start_utc)
    if to_date:
        _, end_utc = vietnam_day_utc_bounds(to_date)
        conditions.append(InternalCodCollectionSession.collected_at < end_utc)
    if shipper_id:
        conditions.append(InternalCodCollectionSession.shipper_id == shipper_id)
    sessions = db.scalars(
        session_query().where(*conditions)
        .order_by(InternalCodCollectionSession.collected_at.desc(), InternalCodCollectionSession.id.desc())
    ).unique().all()
    return [serialize_session(session) for session in sessions]


def get_session(db: Session, session_id: int) -> dict:
    session = db.scalar(session_query().where(InternalCodCollectionSession.id == session_id))
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phiên thu tiền không tồn tại")
    return serialize_session(session)


def create_session(
    db: Session,
    payload: InternalCodCollectionCreate,
    current_user: User,
) -> dict:
    shipper = db.scalar(
        select(Shipper).options(selectinload(Shipper.user)).where(Shipper.id == payload.shipper_id)
    )
    if not shipper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipper nội bộ không tồn tại")
    try:
        invoices = list(db.scalars(
            pending_invoice_query(payload.collection_date)
            .where(Invoice.assigned_shipper_id == shipper.id)
            .order_by(Invoice.audited_at, Invoice.id)
            .with_for_update()
        ).all())
        if not invoices:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Shipper không có đơn COD đã bàn giao nào đang chờ thu tiền",
            )
        requested_ids = set(payload.invoice_ids)
        current_ids = {invoice.id for invoice in invoices}
        if requested_ids != current_ids:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Công nợ shipper vừa thay đổi. Vui lòng tải lại trước khi xác nhận thu tiền",
            )

        now = datetime.utcnow()
        total_amount = sum((invoice.total_amount for invoice in invoices), Decimal("0"))
        session = InternalCodCollectionSession(
            code=f"TEMP-{now.timestamp()}",
            shipper_id=shipper.id,
            invoice_count=len(invoices),
            total_amount=total_amount,
            collected_at=now,
            collected_by_user_id=current_user.id,
            note=payload.note.strip() if payload.note and payload.note.strip() else None,
        )
        db.add(session)
        db.flush()
        local_now = datetime.now(VIETNAM_TIMEZONE)
        session.code = f"TT-{local_now:%y%m%d}-{session.id:04d}"
        for invoice in invoices:
            session.items.append(InternalCodCollectionItem(
                invoice_id=invoice.id,
                invoice_code=invoice.code,
                customer_name=invoice.customer.name if invoice.customer else None,
                cod_amount=invoice.total_amount,
                handed_over_at=invoice.audited_at,
                delivered_at=invoice.delivered_at,
            ))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Một hoặc nhiều đơn vừa được ghi nhận trong phiên thu tiền khác",
        ) from exc
    except Exception:
        db.rollback()
        raise
    return get_session(db, session.id)
