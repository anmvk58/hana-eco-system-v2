from datetime import date, datetime, time

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.enums import InvoiceAuditLabel, InvoiceStatus
from app.models.enums import ExternalHandoverBatchStatus
from app.models.external_handover import ExternalHandoverBatch
from app.models.external_handover_reconciliation import ExternalHandoverBatchReconciliation
from app.models.invoice import Invoice
from app.models.retail_invoice_collection import RetailInvoiceCollection
from app.models.shipper import Shipper
from app.models.user import User
from app.schemas.order_reconciliation import ExternalHandoverReconcileCreate, RetailInvoiceCollectCreate
from app.services import ship_management_service


def invoice_load_options():
    return (
        selectinload(Invoice.customer),
        selectinload(Invoice.assigned_shipper).selectinload(Shipper.user),
        selectinload(Invoice.items),
        selectinload(Invoice.extra_charges),
    )


def sale_date_conditions(from_date: date | None, to_date: date | None):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc")
    conditions = []
    if from_date:
        conditions.append(Invoice.sold_at >= datetime.combine(from_date, time.min))
    if to_date:
        conditions.append(Invoice.sold_at <= datetime.combine(to_date, time.max))
    return conditions


def list_unaudited_invoices(db: Session, from_date: date | None, to_date: date | None) -> list[Invoice]:
    return list(db.scalars(
        select(Invoice)
        .options(*invoice_load_options())
        .where(
            Invoice.audit_label.is_(None),
            Invoice.status != InvoiceStatus.cancelled,
            Invoice.deleted_at.is_(None),
            *sale_date_conditions(from_date, to_date),
        )
        .order_by(Invoice.created_at.desc(), Invoice.id.desc())
    ).all())


def serialize_collection(collection: RetailInvoiceCollection) -> dict:
    return {
        "id": collection.id,
        "invoice_id": collection.invoice_id,
        "invoice_code": collection.invoice_code,
        "customer_name": collection.customer_name,
        "collected_amount": collection.collected_amount,
        "is_paid_by_transfer": collection.is_paid_by_transfer,
        "collected_at": collection.collected_at,
        "collected_by_name": collection.collected_by_user.display_name if collection.collected_by_user else None,
        "note": collection.note,
        "created_at": collection.created_at,
        "updated_at": collection.updated_at,
    }


def list_retail_invoices(db: Session, from_date: date | None = None, to_date: date | None = None) -> list[dict]:
    invoices = list(db.scalars(
        select(Invoice)
        .options(*invoice_load_options())
        .where(
            or_(
                Invoice.audit_label == InvoiceAuditLabel.retail,
                (
                    Invoice.is_paid_by_transfer.is_(True)
                    & Invoice.audit_label.is_not(None)
                ),
            ),
            Invoice.status != InvoiceStatus.cancelled,
            Invoice.deleted_at.is_(None),
            *sale_date_conditions(from_date, to_date),
        )
        .order_by(Invoice.audited_at.desc(), Invoice.id.desc())
    ).all())
    if not invoices:
        return []
    collections = list(db.scalars(
        select(RetailInvoiceCollection)
        .options(selectinload(RetailInvoiceCollection.collected_by_user))
        .where(RetailInvoiceCollection.invoice_id.in_([invoice.id for invoice in invoices]))
    ).all())
    collection_by_invoice = {collection.invoice_id: collection for collection in collections}
    return [
        {
            "invoice": invoice,
            "collection": serialize_collection(collection_by_invoice[invoice.id])
            if invoice.id in collection_by_invoice else None,
        }
        for invoice in invoices
    ]


def collect_retail_invoice(
    db: Session,
    invoice_id: int,
    payload: RetailInvoiceCollectCreate,
    current_user: User,
) -> dict:
    try:
        invoice = db.scalar(
            select(Invoice)
            .options(*invoice_load_options())
            .where(Invoice.id == invoice_id)
            .with_for_update()
        )
        if not invoice or invoice.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hóa đơn không tồn tại")
        if invoice.status == InvoiceStatus.cancelled:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể thu tiền hóa đơn đã hủy")
        if invoice.audit_label != InvoiceAuditLabel.retail and not (
            invoice.is_paid_by_transfer and invoice.audit_label is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Chỉ có thể kiểm kê đơn Khách lẻ hoặc đơn chuyển khoản đã được audit",
            )
        existing = db.scalar(
            select(RetailInvoiceCollection).where(RetailInvoiceCollection.invoice_id == invoice.id)
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Hóa đơn này đã được đánh dấu thu tiền")

        collection = RetailInvoiceCollection(
            invoice_id=invoice.id,
            invoice_code=invoice.code,
            customer_name=invoice.customer.name if invoice.customer else None,
            collected_amount=invoice.total_amount,
            is_paid_by_transfer=invoice.is_paid_by_transfer,
            collected_at=datetime.utcnow(),
            collected_by_user_id=current_user.id,
            note=payload.note.strip() if payload.note and payload.note.strip() else None,
        )
        db.add(collection)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Hóa đơn này vừa được đánh dấu thu tiền bởi người dùng khác",
        ) from exc
    except Exception:
        db.rollback()
        raise

    rows = list_retail_invoices(db)
    return next(row for row in rows if row["invoice"].id == invoice_id)


def serialize_external_reconciliation(reconciliation: ExternalHandoverBatchReconciliation) -> dict:
    return {
        "id": reconciliation.id,
        "batch_id": reconciliation.batch_id,
        "batch_code": reconciliation.batch_code,
        "invoice_count": reconciliation.invoice_count,
        "expected_amount": reconciliation.expected_amount,
        "received_amount": reconciliation.received_amount,
        "advance_method": reconciliation.advance_method,
        "reconciled_at": reconciliation.reconciled_at,
        "reconciled_by_name": reconciliation.reconciled_by_user.display_name
        if reconciliation.reconciled_by_user else None,
        "note": reconciliation.note,
        "created_at": reconciliation.created_at,
        "updated_at": reconciliation.updated_at,
    }


def list_external_handover_reconciliations(
    db: Session,
    from_date: date | None,
    to_date: date | None,
) -> list[dict]:
    batches = ship_management_service.list_batches(db, from_date, to_date)
    active_batches = [batch for batch in batches if batch["status"] == ExternalHandoverBatchStatus.active]
    if not active_batches:
        return []
    reconciliations = list(db.scalars(
        select(ExternalHandoverBatchReconciliation)
        .options(selectinload(ExternalHandoverBatchReconciliation.reconciled_by_user))
        .where(ExternalHandoverBatchReconciliation.batch_id.in_([batch["id"] for batch in active_batches]))
    ).all())
    reconciliation_by_batch = {row.batch_id: row for row in reconciliations}
    return [
        {
            "batch": batch,
            "reconciliation": serialize_external_reconciliation(reconciliation_by_batch[batch["id"]])
            if batch["id"] in reconciliation_by_batch else None,
        }
        for batch in active_batches
    ]


def reconcile_external_handover_batch(
    db: Session,
    batch_id: int,
    payload: ExternalHandoverReconcileCreate,
    current_user: User,
) -> dict:
    try:
        batch = db.scalar(
            select(ExternalHandoverBatch)
            .options(selectinload(ExternalHandoverBatch.items))
            .where(ExternalHandoverBatch.id == batch_id)
            .with_for_update()
        )
        if not batch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phiên bàn giao Ship ngoài không tồn tại")
        if batch.status != ExternalHandoverBatchStatus.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể kiểm kê phiên bàn giao đã hủy")
        existing = db.scalar(
            select(ExternalHandoverBatchReconciliation)
            .where(ExternalHandoverBatchReconciliation.batch_id == batch.id)
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phiên bàn giao này đã được kiểm kê")

        reconciliation = ExternalHandoverBatchReconciliation(
            batch_id=batch.id,
            batch_code=batch.code,
            invoice_count=len([item for item in batch.items if item.is_active]),
            expected_amount=batch.advance_amount,
            received_amount=batch.transfer_amount + batch.cash_amount,
            advance_method=batch.advance_method,
            reconciled_at=datetime.utcnow(),
            reconciled_by_user_id=current_user.id,
            note=payload.note.strip() if payload.note and payload.note.strip() else None,
        )
        db.add(reconciliation)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phiên bàn giao này vừa được kiểm kê bởi người dùng khác",
        ) from exc
    except Exception:
        db.rollback()
        raise

    batch_data = ship_management_service.get_batch(db, batch_id)
    reconciliation = db.scalar(
        select(ExternalHandoverBatchReconciliation)
        .options(selectinload(ExternalHandoverBatchReconciliation.reconciled_by_user))
        .where(ExternalHandoverBatchReconciliation.batch_id == batch_id)
    )
    return {"batch": batch_data, "reconciliation": serialize_external_reconciliation(reconciliation)}
