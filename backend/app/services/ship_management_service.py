from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.enums import ExternalHandoverBatchStatus, InvoiceAuditLabel, InvoiceHistoryAction, InvoiceStatus
from app.models.external_handover import ExternalHandoverBatch, ExternalHandoverBatchItem
from app.models.external_handover_reconciliation import ExternalHandoverBatchReconciliation
from app.models.internal_cod_collection import InternalCodCollectionItem
from app.models.invoice import Invoice
from app.models.retail_invoice_collection import RetailInvoiceCollection
from app.models.shipper import Shipper
from app.models.user import User
from app.schemas.external_handover import ExternalHandoverBatchUpdate
from app.schemas.invoice import ExternalHandoffCreate, InternalShipperHandover, InternalShipperRecall, InvoiceBulkAuditAssign
from app.services import invoice_service
from app.services.time_service import VIETNAM_TIMEZONE, vietnam_day_utc_bounds


def invoice_load_options():
    return (
        selectinload(Invoice.customer),
        selectinload(Invoice.items),
        selectinload(Invoice.extra_charges),
        selectinload(Invoice.assigned_shipper).selectinload(Shipper.user),
    )


def unaudited_query():
    return select(Invoice).options(*invoice_load_options()).where(
        Invoice.audit_label.is_(None),
        Invoice.status == InvoiceStatus.created,
        Invoice.deleted_at.is_(None),
    )


def list_unaudited_invoices(db: Session, from_date: date | None, to_date: date | None) -> list[Invoice]:
    today = datetime.now(VIETNAM_TIMEZONE).date()
    effective_from = from_date or today
    effective_to = to_date or today
    if effective_from > effective_to:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc")
    start_utc, _ = vietnam_day_utc_bounds(effective_from)
    _, end_utc = vietnam_day_utc_bounds(effective_to)
    return list(db.scalars(
        unaudited_query().where(Invoice.created_at >= start_utc, Invoice.created_at < end_utc)
        .order_by(Invoice.created_at, Invoice.id)
    ).unique().all())


def get_unaudited_invoice_by_code(db: Session, code: str) -> Invoice:
    normalized_code = code.strip().upper()
    invoice = db.scalar(unaudited_query().where(Invoice.code == normalized_code))
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn chưa audit có mã này")
    return invoice


def list_active_internal_shippers(db: Session) -> list[Shipper]:
    return list(db.scalars(
        select(Shipper)
        .options(selectinload(Shipper.user))
        .join(Shipper.user)
        .where(Shipper.is_active.is_(True), User.is_active.is_(True))
        .order_by(User.display_name, Shipper.id)
    ).all())


def handover_to_internal_shipper(
    db: Session,
    payload: InternalShipperHandover,
    current_user: User,
) -> list[Invoice]:
    unique_ids = list(dict.fromkeys(payload.invoice_ids))
    try:
        shipper = db.scalar(
            select(Shipper)
            .options(selectinload(Shipper.user))
            .join(Shipper.user)
            .where(
                Shipper.id == payload.shipper_id,
                Shipper.is_active.is_(True),
                User.is_active.is_(True),
            )
            .with_for_update()
        )
        if not shipper:
            raise HTTPException(status_code=404, detail="Shipper nội bộ không tồn tại hoặc đã ngừng hoạt động")

        invoices = list(db.scalars(
            unaudited_query()
            .where(Invoice.id.in_(unique_ids))
            .order_by(Invoice.created_at, Invoice.id)
            .with_for_update()
        ).unique().all())
        if len(invoices) != len(unique_ids):
            raise HTTPException(
                status_code=409,
                detail="Một hoặc nhiều đơn không còn ở trạng thái chưa audit. Không có đơn nào được bàn giao",
            )

        audited_at = datetime.utcnow()
        for invoice in invoices:
            before_data = invoice_service.snapshot_invoice(invoice)
            invoice.audit_label = InvoiceAuditLabel.internal_shipper
            invoice.assigned_shipper_id = shipper.id
            invoice.audited_at = audited_at
            invoice.audited_by_user_id = current_user.id
            clear_finance_only(invoice)
            add_invoice_history(
                db,
                invoice,
                before_data,
                current_user,
                f"Bàn giao cho shipper nội bộ {shipper.user.display_name}",
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return [invoice_service.get_invoice(db, invoice.id) for invoice in invoices]


def list_internal_shipper_assignments(
    db: Session,
    from_date: date | None,
    to_date: date | None,
) -> list[dict]:
    today = datetime.now(VIETNAM_TIMEZONE).date()
    effective_from = from_date or today
    effective_to = to_date or today
    if effective_from > effective_to:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc")
    start_utc, _ = vietnam_day_utc_bounds(effective_from)
    _, end_utc = vietnam_day_utc_bounds(effective_to)
    invoices = list(db.scalars(
        select(Invoice)
        .options(*invoice_load_options())
        .where(
            Invoice.audit_label == InvoiceAuditLabel.internal_shipper,
            Invoice.assigned_shipper_id.is_not(None),
            Invoice.audited_at >= start_utc,
            Invoice.audited_at < end_utc,
            Invoice.deleted_at.is_(None),
        )
        .order_by(Invoice.audited_at.desc(), Invoice.id.desc())
    ).unique().all())
    if not invoices:
        return []

    invoice_ids = [invoice.id for invoice in invoices]
    cod_collected_ids = set(db.scalars(
        select(InternalCodCollectionItem.invoice_id).where(InternalCodCollectionItem.invoice_id.in_(invoice_ids))
    ).all())
    reconciled_ids = set(db.scalars(
        select(RetailInvoiceCollection.invoice_id).where(RetailInvoiceCollection.invoice_id.in_(invoice_ids))
    ).all())
    rows = []
    for invoice in invoices:
        block_reason = None
        if invoice.status == InvoiceStatus.cancelled:
            block_reason = "Hóa đơn đã hủy nên không thể thu hồi phân công"
        elif invoice.id in cod_collected_ids:
            block_reason = "Đơn đã nằm trong phiên thu tiền COD"
        elif invoice.id in reconciled_ids:
            block_reason = "Đơn đã được kiểm kê tiền"
        rows.append({
            "invoice": invoice,
            "can_recall": block_reason is None,
            "recall_block_reason": block_reason,
        })
    return rows


def recall_internal_shipper_assignment(
    db: Session,
    invoice_id: int,
    payload: InternalShipperRecall,
    current_user: User,
) -> Invoice:
    try:
        invoice = db.scalar(
            select(Invoice)
            .options(*invoice_load_options())
            .where(Invoice.id == invoice_id)
            .with_for_update()
        )
        if not invoice or invoice.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Hóa đơn không tồn tại")
        if invoice.audit_label != InvoiceAuditLabel.internal_shipper or invoice.assigned_shipper_id is None:
            raise HTTPException(status_code=409, detail="Đơn không còn được giao cho shipper nội bộ")
        if invoice.status == InvoiceStatus.cancelled:
            raise HTTPException(status_code=409, detail="Hóa đơn đã hủy nên không thể thu hồi phân công")
        cod_collected = db.scalar(
            select(InternalCodCollectionItem.id).where(InternalCodCollectionItem.invoice_id == invoice.id)
        )
        if cod_collected:
            raise HTTPException(status_code=409, detail="Không thể thu hồi đơn đã nằm trong phiên thu tiền COD")
        reconciled = db.scalar(
            select(RetailInvoiceCollection.id).where(RetailInvoiceCollection.invoice_id == invoice.id)
        )
        if reconciled:
            raise HTTPException(status_code=409, detail="Không thể thu hồi đơn đã được kiểm kê tiền")

        before_data = invoice_service.snapshot_invoice(invoice)
        shipper_name = invoice.assigned_shipper.user.display_name if invoice.assigned_shipper else "không xác định"
        was_delivered = invoice.delivered_at is not None or invoice.status == InvoiceStatus.completed
        if invoice.status == InvoiceStatus.completed:
            invoice.status = InvoiceStatus.created
        invoice.audit_label = None
        invoice.assigned_shipper_id = None
        invoice.audited_at = None
        invoice.audited_by_user_id = None
        invoice.delivered_at = None
        invoice.delivered_by_user_id = None
        clear_finance_only(invoice)
        detail = payload.reason.strip() if payload.reason and payload.reason.strip() else None
        reason = f"Thu hồi đơn khỏi shipper nội bộ {shipper_name}"
        if was_delivered:
            reason += "; hoàn tác trạng thái giao thành công về Đã tạo"
        if detail:
            reason += f". Lý do: {detail}"
        add_invoice_history(db, invoice, before_data, current_user, reason)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return invoice_service.get_invoice(db, invoice_id)


def create_batch(db: Session, invoices: list[Invoice], external: ExternalHandoffCreate, current_user: User) -> ExternalHandoverBatch:
    now = datetime.utcnow()
    cod_total = sum((invoice.total_amount for invoice in invoices if not invoice.is_paid_by_transfer), Decimal("0"))
    batch = ExternalHandoverBatch(
        code=f"TEMP-{now.timestamp()}",
        handed_over_at=now,
        advance_method=external.advance_method,
        transfer_amount=external.transfer_amount,
        cash_amount=external.cash_amount,
        shipping_fee=external.shipping_fee,
        advance_amount=cod_total - external.shipping_fee,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    db.add(batch)
    db.flush()
    batch.code = f"BG-{now:%y%m%d}-{batch.id:04d}"
    for invoice in invoices:
        db.add(ExternalHandoverBatchItem(batch_id=batch.id, invoice_id=invoice.id, added_by_user_id=current_user.id))
    return batch


def apply_external_handoff(invoice: Invoice, external: ExternalHandoffCreate, advance_amount: Decimal, current_user: User) -> None:
    invoice.audit_label = InvoiceAuditLabel.external_shipper
    invoice.assigned_shipper_id = None
    invoice.audited_at = datetime.utcnow()
    invoice.audited_by_user_id = current_user.id
    invoice.external_shipper_name = None
    invoice.external_shipper_phone = None
    invoice.external_advance_method = external.advance_method
    invoice.external_transfer_amount = external.transfer_amount
    invoice.external_cash_amount = external.cash_amount
    invoice.external_shipping_fee = external.shipping_fee
    invoice.external_advance_amount = advance_amount


def clear_external_handoff(invoice: Invoice) -> None:
    invoice.audit_label = None
    invoice.assigned_shipper_id = None
    invoice.audited_at = None
    invoice.audited_by_user_id = None
    invoice.external_shipper_name = None
    invoice.external_shipper_phone = None
    invoice.external_advance_method = None
    invoice.external_transfer_amount = Decimal("0")
    invoice.external_cash_amount = Decimal("0")
    invoice.external_shipping_fee = Decimal("0")
    invoice.external_advance_amount = Decimal("0")


def add_invoice_history(db: Session, invoice: Invoice, before_data: dict, current_user: User, reason: str) -> None:
    db.flush()
    invoice_service.add_history(
        db, invoice, InvoiceHistoryAction.updated, before_data=before_data,
        after_data=invoice_service.snapshot_invoice(invoice), user_id=current_user.id,
        user_name=current_user.display_name, reason=reason,
    )


def handover_invoices(db: Session, payload: InvoiceBulkAuditAssign, current_user: User) -> list[Invoice]:
    unique_ids = list(dict.fromkeys(payload.invoice_ids))
    try:
        invoices = list(db.scalars(
            unaudited_query().where(Invoice.id.in_(unique_ids)).order_by(Invoice.created_at, Invoice.id).with_for_update()
        ).unique().all())
        if len(invoices) != len(unique_ids):
            raise HTTPException(status_code=409, detail="Một hoặc nhiều đơn không còn ở trạng thái chưa audit. Không có đơn nào được bàn giao")

        external = payload.external_handoff
        batch = create_batch(db, invoices, external, current_user) if payload.audit_label == InvoiceAuditLabel.external_shipper and external else None
        advance_amount = batch.advance_amount if batch else Decimal("0")
        for invoice in invoices:
            before_data = invoice_service.snapshot_invoice(invoice)
            if batch and external:
                apply_external_handoff(invoice, external, advance_amount, current_user)
                reason = f"Bàn giao Ship Ngoài - {batch.code}"
            else:
                invoice.audit_label = InvoiceAuditLabel.retail
                invoice.assigned_shipper_id = None
                invoice.audited_at = datetime.utcnow()
                invoice.audited_by_user_id = current_user.id
                clear_finance_only(invoice)
                reason = "Đánh dấu đơn Khách lẻ"
            add_invoice_history(db, invoice, before_data, current_user, reason)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return [invoice_service.get_invoice(db, invoice.id) for invoice in invoices]


def clear_finance_only(invoice: Invoice) -> None:
    invoice.external_shipper_name = None
    invoice.external_shipper_phone = None
    invoice.external_advance_method = None
    invoice.external_transfer_amount = Decimal("0")
    invoice.external_cash_amount = Decimal("0")
    invoice.external_shipping_fee = Decimal("0")
    invoice.external_advance_amount = Decimal("0")


def batch_query():
    return select(ExternalHandoverBatch).options(
        selectinload(ExternalHandoverBatch.created_by_user),
        selectinload(ExternalHandoverBatch.updated_by_user),
        selectinload(ExternalHandoverBatch.cancelled_by_user),
        selectinload(ExternalHandoverBatch.reconciliation),
        selectinload(ExternalHandoverBatch.items).selectinload(ExternalHandoverBatchItem.invoice).selectinload(Invoice.customer),
        selectinload(ExternalHandoverBatch.items).selectinload(ExternalHandoverBatchItem.invoice).selectinload(Invoice.items),
        selectinload(ExternalHandoverBatch.items).selectinload(ExternalHandoverBatchItem.invoice).selectinload(Invoice.extra_charges),
        selectinload(ExternalHandoverBatch.items).selectinload(ExternalHandoverBatchItem.invoice).selectinload(Invoice.assigned_shipper).selectinload(Shipper.user),
    )


def serialize_batch(batch: ExternalHandoverBatch) -> dict:
    return {
        "id": batch.id, "code": batch.code, "status": batch.status, "handed_over_at": batch.handed_over_at,
        "advance_method": batch.advance_method, "transfer_amount": batch.transfer_amount,
        "cash_amount": batch.cash_amount, "shipping_fee": batch.shipping_fee, "advance_amount": batch.advance_amount,
        "created_by_name": batch.created_by_user.display_name if batch.created_by_user else None,
        "updated_by_name": batch.updated_by_user.display_name if batch.updated_by_user else None,
        "cancelled_at": batch.cancelled_at,
        "cancelled_by_name": batch.cancelled_by_user.display_name if batch.cancelled_by_user else None,
        "is_reconciled": batch.reconciliation is not None,
        "items": sorted(batch.items, key=lambda item: (not item.is_active, item.id)),
        "created_at": batch.created_at, "updated_at": batch.updated_at,
    }


def list_batches(db: Session, from_date: date | None, to_date: date | None) -> list[dict]:
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc")
    conditions = []
    if from_date:
        start_utc, _ = vietnam_day_utc_bounds(from_date)
        conditions.append(ExternalHandoverBatch.handed_over_at >= start_utc)
    if to_date:
        _, end_utc = vietnam_day_utc_bounds(to_date)
        conditions.append(ExternalHandoverBatch.handed_over_at < end_utc)
    batches = db.scalars(
        batch_query().where(*conditions)
        .order_by(ExternalHandoverBatch.handed_over_at.desc(), ExternalHandoverBatch.id.desc())
    ).unique().all()
    return [serialize_batch(batch) for batch in batches]


def get_batch_model(db: Session, batch_id: int, for_update: bool = False) -> ExternalHandoverBatch:
    query = batch_query().where(ExternalHandoverBatch.id == batch_id)
    if for_update:
        query = query.with_for_update()
    batch = db.scalar(query)
    if not batch:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng kê bàn giao")
    return batch


def get_batch(db: Session, batch_id: int) -> dict:
    return serialize_batch(get_batch_model(db, batch_id))


def update_batch(db: Session, batch_id: int, payload: ExternalHandoverBatchUpdate, current_user: User) -> dict:
    unique_ids = list(dict.fromkeys(payload.invoice_ids))
    try:
        batch = get_batch_model(db, batch_id, True)
        if batch.status != ExternalHandoverBatchStatus.active:
            raise HTTPException(status_code=409, detail="Bảng kê đã hủy, không thể chỉnh sửa")
        if batch.reconciliation is not None:
            raise HTTPException(status_code=409, detail="Bảng kê đã kiểm kê và nhận tiền, không thể chỉnh sửa")
        active_items = {item.invoice_id: item for item in batch.items if item.is_active}
        requested_ids = set(unique_ids)
        added_ids, removed_ids = requested_ids - active_items.keys(), active_items.keys() - requested_ids
        added_invoices = list(db.scalars(unaudited_query().where(Invoice.id.in_(added_ids)).with_for_update()).unique().all()) if added_ids else []
        if len(added_invoices) != len(added_ids):
            raise HTTPException(status_code=409, detail="Một hoặc nhiều đơn cần thêm không còn hợp lệ")
        current_invoices = [item.invoice for item in active_items.values() if item.invoice_id in requested_ids]
        final_invoices = current_invoices + added_invoices
        cod_total = sum((invoice.total_amount for invoice in final_invoices if not invoice.is_paid_by_transfer), Decimal("0"))
        advance_amount = cod_total - payload.external_handoff.shipping_fee
        now = datetime.utcnow()

        for invoice_id in removed_ids:
            item = active_items[invoice_id]
            before = invoice_service.snapshot_invoice(item.invoice)
            item.is_active, item.removed_at, item.removed_by_user_id = False, now, current_user.id
            clear_external_handoff(item.invoice)
            add_invoice_history(db, item.invoice, before, current_user, f"Bỏ khỏi bảng kê {batch.code}")
        for invoice in added_invoices:
            existing = next((item for item in batch.items if item.invoice_id == invoice.id), None)
            if existing:
                existing.is_active, existing.added_at, existing.added_by_user_id = True, now, current_user.id
                existing.removed_at, existing.removed_by_user_id = None, None
            else:
                db.add(ExternalHandoverBatchItem(batch_id=batch.id, invoice_id=invoice.id, added_by_user_id=current_user.id))
        for invoice in final_invoices:
            before = invoice_service.snapshot_invoice(invoice)
            apply_external_handoff(invoice, payload.external_handoff, advance_amount, current_user)
            add_invoice_history(db, invoice, before, current_user, f"Cập nhật bảng kê {batch.code}")

        batch.advance_method = payload.external_handoff.advance_method
        batch.transfer_amount = payload.external_handoff.transfer_amount
        batch.cash_amount = payload.external_handoff.cash_amount
        batch.shipping_fee = payload.external_handoff.shipping_fee
        batch.advance_amount = advance_amount
        batch.updated_by_user_id = current_user.id
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_batch(db, batch_id)


def cancel_batch(db: Session, batch_id: int, current_user: User) -> dict:
    try:
        batch = get_batch_model(db, batch_id, True)
        if batch.status != ExternalHandoverBatchStatus.active:
            raise HTTPException(status_code=409, detail="Bảng kê đã được hủy trước đó")
        if batch.reconciliation is not None:
            raise HTTPException(status_code=409, detail="Bảng kê đã kiểm kê và nhận tiền, không thể hủy")
        now = datetime.utcnow()
        for item in [item for item in batch.items if item.is_active]:
            before = invoice_service.snapshot_invoice(item.invoice)
            item.is_active, item.removed_at, item.removed_by_user_id = False, now, current_user.id
            clear_external_handoff(item.invoice)
            add_invoice_history(db, item.invoice, before, current_user, f"Hủy bàn giao bảng kê {batch.code}")
        batch.status = ExternalHandoverBatchStatus.cancelled
        batch.cancelled_at = now
        batch.cancelled_by_user_id = current_user.id
        batch.updated_by_user_id = current_user.id
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_batch(db, batch_id)


def ensure_legacy_external_handover_batches(db: Session) -> None:
    existing_ids = set(db.scalars(select(ExternalHandoverBatchItem.invoice_id)).all())
    invoices = list(db.scalars(select(Invoice).where(
        Invoice.audit_label == InvoiceAuditLabel.external_shipper,
        Invoice.id.not_in(existing_ids) if existing_ids else True,
    ).order_by(Invoice.audited_at, Invoice.id)).all())
    groups: dict[tuple, list[Invoice]] = {}
    for invoice in invoices:
        key = (invoice.audited_at, invoice.audited_by_user_id, invoice.external_advance_method,
               invoice.external_transfer_amount, invoice.external_cash_amount,
               invoice.external_shipping_fee, invoice.external_advance_amount)
        groups.setdefault(key, []).append(invoice)
    for grouped in groups.values():
        first = grouped[0]
        batch = ExternalHandoverBatch(
            code=f"LEGACY-{first.id}", handed_over_at=first.audited_at or first.created_at,
            advance_method=first.external_advance_method, transfer_amount=first.external_transfer_amount,
            cash_amount=first.external_cash_amount, shipping_fee=first.external_shipping_fee,
            advance_amount=first.external_advance_amount, created_by_user_id=first.audited_by_user_id,
            updated_by_user_id=first.audited_by_user_id,
        )
        db.add(batch)
        db.flush()
        batch.code = f"BG-{batch.handed_over_at:%y%m%d}-{batch.id:04d}"
        for invoice in grouped:
            db.add(ExternalHandoverBatchItem(batch_id=batch.id, invoice_id=invoice.id, added_by_user_id=invoice.audited_by_user_id))
    if groups:
        db.commit()
