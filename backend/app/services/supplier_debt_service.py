from contextlib import contextmanager
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy import and_, case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.supplier_debt import Supplier, SupplierDebtEntry, SupplierDebtHistory, SupplierDebtItem, SupplierDebtPayment
from app.schemas.supplier_debt import DebtEntryRead, DebtPaymentRead
from app.services.time_service import utc_now

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999999999.99")


@contextmanager
def transaction(db: Session):
    try:
        yield
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Dữ liệu bị trùng hoặc đã thay đổi. Vui lòng tải lại.") from exc
    except Exception:
        db.rollback()
        raise


def lock_supplier(db, supplier_id, require_active=False):
    # Every mutation locks the supplier first, serializing edit/pay/undo for this
    # ledger. All locking reads refresh the identity map after waiting for a lock.
    supplier = db.scalar(select(Supplier).where(Supplier.id == supplier_id).with_for_update().execution_options(populate_existing=True))
    if not supplier:
        raise HTTPException(404, "Nhà cung cấp không tồn tại")
    if require_active and not supplier.is_active:
        raise HTTPException(409, "Nhà cung cấp đã ngừng sử dụng. Hãy kích hoạt lại trước khi lập phiếu.")
    return supplier


def signed(entry):
    return -entry.amount if entry.kind == "decrease" else entry.amount


def entry_read(entry):
    return DebtEntryRead(
        id=entry.id, code=f"{'PN' if entry.kind == 'purchase' else 'DC'}-{entry.id:06d}",
        supplier_id=entry.supplier_id, supplier_name=entry.supplier.name, kind=entry.kind, entry_date=entry.entry_date,
        description=entry.description, note=entry.note, amount=entry.amount, signed_amount=signed(entry),
        revision=entry.revision, payment_id=entry.payment_id, cancelled_at=entry.cancelled_at,
        items=entry.items, created_at=entry.created_at,
    )


def payment_read(payment):
    return DebtPaymentRead(
        id=payment.id, code=f"TTNCC-{payment.id:06d}", supplier_id=payment.supplier_id,
        supplier_name=payment.supplier_name, paid_on=payment.paid_on, method=payment.method,
        amount=payment.amount, note=payment.note,
        created_by_name=payment.created_by_user.display_name if payment.created_by_user else None,
        cancelled_at=payment.cancelled_at, cancel_reason=payment.cancel_reason,
        entries=payment.entries_snapshot, created_at=payment.created_at,
    )


def history(db, supplier_id, actor, action, details, entry_id=None, payment_id=None):
    db.add(SupplierDebtHistory(
        supplier_id=supplier_id, entry_id=entry_id, payment_id=payment_id, action=action,
        actor_user_id=actor.id, actor_name=actor.display_name, occurred_at=utc_now(), details=details,
    ))


def date_conditions(column, from_date, to_date):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(422, "Ngày bắt đầu không được sau ngày kết thúc")
    return ([column >= from_date] if from_date else []) + ([column <= to_date] if to_date else [])


def list_suppliers(db, supplier_id=None, from_date=None, to_date=None):
    in_period = and_(True, *date_conditions(SupplierDebtEntry.entry_date, from_date, to_date))
    amount = case((SupplierDebtEntry.kind == "decrease", -SupplierDebtEntry.amount), else_=SupplierDebtEntry.amount)
    totals = select(
        SupplierDebtEntry.supplier_id.label("supplier_id"),
        func.sum(amount).label("amount"),
        func.count().label("count"),
        func.sum(case((in_period, amount), else_=0)).label("period_amount"),
        func.sum(case((in_period, 1), else_=0)).label("period_count"),
    ).where(SupplierDebtEntry.cancelled_at.is_(None), SupplierDebtEntry.payment_id.is_(None)).group_by(SupplierDebtEntry.supplier_id).subquery()
    query = select(Supplier, totals.c.amount, totals.c.count, totals.c.period_amount, totals.c.period_count).outerjoin(totals, totals.c.supplier_id == Supplier.id)
    if supplier_id is not None:
        query = query.where(Supplier.id == supplier_id)
    rows = db.execute(query.order_by(Supplier.is_active.desc(), Supplier.name)).all()
    return [dict(id=s.id, name=s.name, phone=s.phone, address=s.address, note=s.note, is_active=s.is_active,
                 outstanding_amount=amount or Decimal(0), pending_count=count or 0,
                 period_outstanding_amount=period_amount or Decimal(0), period_pending_count=period_count or 0)
            for s, amount, count, period_amount, period_count in rows]


def save_supplier(db, payload, actor, supplier_id=None):
    with transaction(db):
        supplier = lock_supplier(db, supplier_id) if supplier_id else Supplier()
        before = {field: getattr(supplier, field) for field in type(payload).model_fields} if supplier_id else None
        values = payload.model_dump()
        values["name"] = " ".join(values["name"].split())
        duplicate = db.scalar(select(Supplier.id).where(func.lower(Supplier.name) == values["name"].lower(), Supplier.id != (supplier_id or 0)))
        if duplicate:
            raise HTTPException(409, "Tên nhà cung cấp đã tồn tại")
        for field, value in values.items():
            setattr(supplier, field, value)
        db.add(supplier)
        db.flush()
        history(db, supplier.id, actor, "supplier_update" if supplier_id else "supplier_create", {"before": before, "after": values})
        saved_id = supplier.id
    return list_suppliers(db, saved_id)[0]


def get_entry(db, entry_id, lock=False):
    loader = joinedload(SupplierDebtEntry.items) if lock else selectinload(SupplierDebtEntry.items)
    query = select(SupplierDebtEntry).options(loader).where(SupplierDebtEntry.id == entry_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    entry = db.execute(query).unique().scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Phiếu công nợ không tồn tại")
    return entry


def mutable_entry(entry, revision):
    if entry.cancelled_at or entry.payment_id:
        raise HTTPException(409, "Phiếu đã thanh toán hoặc đã hủy, không thể sửa/hủy trực tiếp")
    if entry.revision != revision:
        raise HTTPException(409, "Phiếu đã thay đổi. Vui lòng tải lại trước khi tiếp tục.")


def apply_content(entry, payload):
    entry.kind = payload.kind
    entry.entry_date = payload.entry_date
    entry.description = payload.description
    entry.note = payload.note
    items = [SupplierDebtItem(name=item.name, quantity=item.quantity, unit_price=item.unit_price,
             line_total=(item.quantity * item.unit_price).quantize(CENT, rounding=ROUND_HALF_UP)) for item in payload.items]
    total = sum((item.line_total for item in items), Decimal(0)) if payload.kind == "purchase" else payload.amount
    if total is None or not 0 < total <= MAX_AMOUNT:
        raise HTTPException(422, "Tổng tiền phiếu phải lớn hơn 0 và không vượt quá 999.999.999.999,99đ")
    entry.amount = total
    entry.items = items


def save_entry(db, payload, actor, entry_id=None):
    with transaction(db):
        lock_supplier(db, payload.supplier_id, require_active=entry_id is None)
        entry = get_entry(db, entry_id, lock=True) if entry_id else SupplierDebtEntry(supplier_id=payload.supplier_id, created_by_user_id=actor.id)
        if entry.supplier_id != payload.supplier_id:
            raise HTTPException(409, "Không thể chuyển phiếu sang nhà cung cấp khác")
        before = entry_read(entry).model_dump(mode="json") if entry_id else None
        if entry_id:
            mutable_entry(entry, payload.expected_revision)
            entry.revision += 1
        apply_content(entry, payload)
        db.add(entry)
        db.flush()
        result = entry_read(entry)
        history(db, entry.supplier_id, actor, "entry_update" if entry_id else "entry_create",
                {"before": before, "after": result.model_dump(mode="json")}, entry_id=entry.id)
    return result


def cancel_entry(db, entry_id, payload, actor):
    with transaction(db):
        supplier_id = db.scalar(select(SupplierDebtEntry.supplier_id).where(SupplierDebtEntry.id == entry_id))
        if supplier_id is None:
            raise HTTPException(404, "Phiếu công nợ không tồn tại")
        lock_supplier(db, supplier_id)
        entry = get_entry(db, entry_id, lock=True)
        mutable_entry(entry, payload.expected_revision)
        before = entry_read(entry).model_dump(mode="json")
        entry.cancelled_at = utc_now()
        entry.revision += 1
        db.flush()
        result = entry_read(entry)
        history(db, supplier_id, actor, "entry_cancel", {"reason": payload.reason, "before": before, "after": result.model_dump(mode="json")}, entry_id=entry.id)
    return result


def list_entries(db, supplier_id, state, page, page_size, from_date=None, to_date=None):
    conditions = date_conditions(SupplierDebtEntry.entry_date, from_date, to_date)
    if supplier_id is not None:
        conditions.append(SupplierDebtEntry.supplier_id == supplier_id)
    if state == "pending":
        conditions += [SupplierDebtEntry.cancelled_at.is_(None), SupplierDebtEntry.payment_id.is_(None)]
    elif state == "paid":
        conditions += [SupplierDebtEntry.cancelled_at.is_(None), SupplierDebtEntry.payment_id.is_not(None)]
    elif state == "cancelled":
        conditions += [SupplierDebtEntry.cancelled_at.is_not(None)]
    valid = SupplierDebtEntry.cancelled_at.is_(None)
    increase = case((and_(valid, SupplierDebtEntry.kind != "decrease"), SupplierDebtEntry.amount), else_=0)
    decrease = case((and_(valid, SupplierDebtEntry.kind == "decrease"), SupplierDebtEntry.amount), else_=0)
    pending = case((and_(valid, SupplierDebtEntry.payment_id.is_(None)), increase - decrease), else_=0)
    total, total_increase, total_decrease, pending_amount = db.execute(select(
        func.count(), func.coalesce(func.sum(increase), 0), func.coalesce(func.sum(decrease), 0), func.coalesce(func.sum(pending), 0)
    ).select_from(SupplierDebtEntry).where(*conditions)).one()
    entries = db.scalars(select(SupplierDebtEntry).options(selectinload(SupplierDebtEntry.items), selectinload(SupplierDebtEntry.supplier)).where(*conditions)
                         .order_by(SupplierDebtEntry.entry_date.desc(), SupplierDebtEntry.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return dict(items=[entry_read(entry) for entry in entries], total=total, page=page, page_size=page_size,
                total_increase=total_increase, total_decrease=total_decrease, pending_amount=pending_amount)


def create_payment(db, payload, actor):
    with transaction(db):
        supplier = lock_supplier(db, payload.supplier_id)
        ids = [selection.id for selection in payload.entries]
        entries = db.execute(select(SupplierDebtEntry).options(joinedload(SupplierDebtEntry.items))
                             .where(SupplierDebtEntry.supplier_id == supplier.id, SupplierDebtEntry.id.in_(ids))
                             .order_by(SupplierDebtEntry.id).with_for_update().execution_options(populate_existing=True)).unique().scalars().all()
        if len(entries) != len(ids):
            raise HTTPException(409, "Có phiếu không tồn tại hoặc không thuộc nhà cung cấp này")
        revisions = {selection.id: selection.revision for selection in payload.entries}
        for entry in entries:
            mutable_entry(entry, revisions[entry.id])
        total = sum((signed(entry) for entry in entries), Decimal(0))
        if total < 0:
            raise HTTPException(422, "Tổng thanh toán đang âm. Hãy chọn thêm phiếu tăng công nợ để bù trừ.")
        if total != payload.expected_amount or total > MAX_AMOUNT:
            raise HTTPException(409, "Số tiền thanh toán không khớp. Vui lòng tải lại và chọn lại các phiếu.")
        payment = SupplierDebtPayment(supplier_id=supplier.id, supplier_name=supplier.name, paid_on=payload.paid_on,
                    method=payload.method, amount=total, note=payload.note, created_by_user_id=actor.id,
                    entries_snapshot=[entry_read(entry).model_dump(mode="json") for entry in entries])
        db.add(payment)
        db.flush()
        for entry in entries:
            entry.payment_id = payment.id
            entry.revision += 1
            history(db, supplier.id, actor, "payment_create", {"amount": str(signed(entry))}, entry_id=entry.id, payment_id=payment.id)
        db.flush()
        history(db, supplier.id, actor, "payment_create", {"amount": str(total), "entry_ids": ids}, payment_id=payment.id)
        result = payment_read(payment)
    return result


def undo_payment(db, payment_id, payload, actor):
    with transaction(db):
        supplier_id = db.scalar(select(SupplierDebtPayment.supplier_id).where(SupplierDebtPayment.id == payment_id))
        if supplier_id is None:
            raise HTTPException(404, "Đợt thanh toán không tồn tại")
        lock_supplier(db, supplier_id)
        payment = db.scalar(select(SupplierDebtPayment).where(SupplierDebtPayment.id == payment_id).with_for_update().execution_options(populate_existing=True))
        if payment.cancelled_at:
            raise HTTPException(409, "Đợt thanh toán đã được hoàn tác")
        entries = db.scalars(select(SupplierDebtEntry).where(SupplierDebtEntry.payment_id == payment.id).order_by(SupplierDebtEntry.id).with_for_update().execution_options(populate_existing=True)).all()
        for entry in entries:
            entry.payment_id = None
            entry.revision += 1
            history(db, supplier_id, actor, "payment_undo", {"reason": payload.reason}, entry_id=entry.id, payment_id=payment.id)
        payment.cancelled_at = utc_now()
        payment.cancel_reason = payload.reason
        history(db, supplier_id, actor, "payment_undo", {"reason": payload.reason, "amount": str(payment.amount), "entry_ids": [entry.id for entry in entries]}, payment_id=payment.id)
        db.flush()
        result = payment_read(payment)
    return result


def list_payments(db, supplier_id, page, page_size, from_date=None, to_date=None):
    condition = and_(SupplierDebtPayment.supplier_id == supplier_id, *date_conditions(SupplierDebtPayment.paid_on, from_date, to_date))
    total = db.scalar(select(func.count()).select_from(SupplierDebtPayment).where(condition)) or 0
    payments = db.scalars(select(SupplierDebtPayment).options(selectinload(SupplierDebtPayment.created_by_user)).where(condition)
                          .order_by(SupplierDebtPayment.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return dict(items=[payment_read(payment) for payment in payments], total=total, page=page, page_size=page_size)


def list_history(db, supplier_id, entry_id=None, payment_id=None):
    query = select(SupplierDebtHistory).where(SupplierDebtHistory.supplier_id == supplier_id)
    if entry_id:
        query = query.where(SupplierDebtHistory.entry_id == entry_id)
    if payment_id:
        query = query.where(SupplierDebtHistory.payment_id == payment_id, SupplierDebtHistory.entry_id.is_(None))
    return db.scalars(query.order_by(SupplierDebtHistory.id.desc()).limit(200)).all()
