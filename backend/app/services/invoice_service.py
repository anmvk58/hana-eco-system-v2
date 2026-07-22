from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.customer import Customer
from app.models.enums import ExtraChargeType, InvoiceHistoryAction, InvoiceStatus
from app.models.invoice import Invoice, InvoiceCodeSequence, InvoiceExtraCharge, InvoiceHistory, InvoiceItem
from app.models.product import Product
from app.models.user import User
from app.schemas.invoice import InvoiceCreate, InvoiceExtraChargeCreate, InvoiceItemCreate, InvoiceUpdate


MONEY_QUANT = Decimal("0.01")


def to_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def default_charge_name(charge_type: ExtraChargeType) -> str:
    return {
        ExtraChargeType.shipping: "Phí ship",
        ExtraChargeType.packing: "Phí đóng hàng",
        ExtraChargeType.other: "Phụ thu khác",
    }[charge_type]


def get_actor(db: Session, user_id: int | None, user_name: str | None) -> tuple[int | None, str | None]:
    if user_id:
        user = db.get(User, user_id)
        if user:
            return user.id, user.display_name
    return user_id, user_name


def parse_invoice_sequence_number(code: str, date_key: str) -> int | None:
    prefix = f"HD{date_key}"
    if not code.startswith(prefix):
        return None
    suffix = code.removeprefix(prefix)
    return int(suffix) if suffix.isdigit() else None


def get_existing_max_sequence(db: Session, date_key: str) -> int:
    codes = db.scalars(select(Invoice.code).where(Invoice.code.like(f"HD{date_key}%"))).all()
    numbers = [number for code in codes if (number := parse_invoice_sequence_number(code, date_key)) is not None]
    return max(numbers, default=0)


def ensure_invoice_sequence_row(db: Session, date_key: str) -> None:
    initial_next_value = get_existing_max_sequence(db, date_key) + 1
    db.execute(
        text(
            """
            INSERT INTO invoice_code_sequences (date_key, next_value, created_at, updated_at)
            VALUES (:date_key, :next_value, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE date_key = date_key
            """
        ),
        {"date_key": date_key, "next_value": initial_next_value},
    )


def reserve_invoice_code(db: Session, sold_at: datetime | None = None) -> str:
    current = sold_at or datetime.utcnow()
    date_key = current.strftime("%y%m%d")
    ensure_invoice_sequence_row(db, date_key)
    sequence = db.scalar(select(InvoiceCodeSequence).where(InvoiceCodeSequence.date_key == date_key).with_for_update())
    if not sequence:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invoice sequence not found")

    while True:
        code = f"HD{date_key}{sequence.next_value:04d}"
        sequence.next_value += 1
        existing = db.scalar(select(Invoice.id).where(Invoice.code == code))
        if not existing:
            return code


def validate_customer(db: Session, customer_id: int | None) -> None:
    if customer_id is None:
        return
    customer = db.scalar(select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None)))
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")


def same_datetime_to_second(left: datetime | None, right: datetime | None) -> bool:
    if left is None or right is None:
        return left is right
    return left.replace(microsecond=0) == right.replace(microsecond=0)


def get_active_product(db: Session, product_id: int) -> Product:
    product = db.scalar(select(Product).where(Product.id == product_id, Product.deleted_at.is_(None)))
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {product_id} not found")
    return product


def build_invoice_items(db: Session, payload_items: list[InvoiceItemCreate]) -> list[InvoiceItem]:
    items: list[InvoiceItem] = []
    for payload in payload_items:
        product = get_active_product(db, payload.product_id)
        unit_price = payload.unit_price if payload.unit_price is not None else product.sale_price
        line_total = to_money(payload.quantity * unit_price)
        items.append(
            InvoiceItem(
                product_id=product.id,
                product_code=product.code,
                product_name=product.name,
                unit=product.unit,
                quantity=payload.quantity,
                unit_price=to_money(unit_price),
                line_total=line_total,
            )
        )
    return items


def build_extra_charges(payload_charges: list[InvoiceExtraChargeCreate]) -> list[InvoiceExtraCharge]:
    charges: list[InvoiceExtraCharge] = []
    for payload in payload_charges:
        charges.append(
            InvoiceExtraCharge(
                charge_type=payload.charge_type,
                name=payload.name or default_charge_name(payload.charge_type),
                amount=to_money(payload.amount),
                note=payload.note,
            )
        )
    return charges


def recalculate_invoice(invoice: Invoice) -> None:
    subtotal = sum((item.line_total for item in invoice.items), Decimal("0"))
    total_extra_charges = sum((charge.amount for charge in invoice.extra_charges), Decimal("0"))
    invoice.subtotal = to_money(subtotal)
    invoice.total_extra_charges = to_money(total_extra_charges)
    invoice.total_amount = to_money(invoice.subtotal + invoice.total_extra_charges)


def apply_stock_change(db: Session, items: list[InvoiceItem], direction: int) -> None:
    for item in items:
        if item.product_id is None:
            continue
        product = db.get(Product, item.product_id)
        if product:
            product.stock_quantity = product.stock_quantity + (item.quantity * direction)


def invoice_query(invoice_id: int):
    return (
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.items),
            selectinload(Invoice.extra_charges),
        )
        .where(Invoice.id == invoice_id)
    )


def get_invoice(db: Session, invoice_id: int, include_deleted: bool = False) -> Invoice:
    stmt = invoice_query(invoice_id)
    if not include_deleted:
        stmt = stmt.where(Invoice.deleted_at.is_(None))
    invoice = db.scalar(stmt)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


def list_invoices(
    db: Session,
    status_filter: InvoiceStatus | None = None,
    customer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[Invoice]:
    stmt = select(Invoice).options(selectinload(Invoice.customer), selectinload(Invoice.items), selectinload(Invoice.extra_charges))
    if not include_deleted:
        stmt = stmt.where(Invoice.deleted_at.is_(None))
    if status_filter:
        stmt = stmt.where(Invoice.status == status_filter)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if from_date:
        stmt = stmt.where(Invoice.sold_at >= datetime.combine(from_date, time.min))
    if to_date:
        stmt = stmt.where(Invoice.sold_at <= datetime.combine(to_date, time.max))
    stmt = stmt.order_by(Invoice.sold_at.desc(), Invoice.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def snapshot_invoice(invoice: Invoice) -> dict[str, Any]:
    data = {
        "id": invoice.id,
        "code": invoice.code,
        "customer_id": invoice.customer_id,
        "status": invoice.status,
        "sold_at": invoice.sold_at,
        "note": invoice.note,
        "subtotal": invoice.subtotal,
        "total_extra_charges": invoice.total_extra_charges,
        "total_amount": invoice.total_amount,
        "deleted_at": invoice.deleted_at,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_code": item.product_code,
                "product_name": item.product_name,
                "unit": item.unit,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "line_total": item.line_total,
            }
            for item in invoice.items
        ],
        "extra_charges": [
            {
                "id": charge.id,
                "charge_type": charge.charge_type,
                "name": charge.name,
                "amount": charge.amount,
                "note": charge.note,
            }
            for charge in invoice.extra_charges
        ],
    }
    return jsonable_encoder(data)


def add_history(
    db: Session,
    invoice: Invoice,
    action: InvoiceHistoryAction,
    before_data: dict[str, Any] | None,
    after_data: dict[str, Any] | None,
    user_id: int | None,
    user_name: str | None,
    reason: str | None,
) -> None:
    actor_id, actor_name = get_actor(db, user_id, user_name)
    db.add(
        InvoiceHistory(
            invoice=invoice,
            action=action,
            changed_by_user_id=actor_id,
            changed_by_name=actor_name,
            reason=reason,
            before_data=before_data,
            after_data=after_data,
        )
    )


def create_invoice(db: Session, payload: InvoiceCreate, user_id: int | None, user_name: str | None) -> Invoice:
    validate_customer(db, payload.customer_id)
    sold_at = payload.sold_at or datetime.utcnow()
    try:
        invoice = Invoice(
            code=payload.code or reserve_invoice_code(db, sold_at),
            customer_id=payload.customer_id,
            status=InvoiceStatus.created,
            sold_at=sold_at,
            note=payload.note,
        )
        invoice.items = build_invoice_items(db, payload.items)
        invoice.extra_charges = build_extra_charges(payload.extra_charges)
        recalculate_invoice(invoice)
        db.add(invoice)
        db.flush()
        apply_stock_change(db, invoice.items, direction=-1)
        add_history(
            db,
            invoice,
            InvoiceHistoryAction.created,
            before_data=None,
            after_data=snapshot_invoice(invoice),
            user_id=user_id,
            user_name=user_name,
            reason=payload.reason,
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice code already exists") from exc
    return get_invoice(db, invoice.id)


def update_invoice(db: Session, invoice_id: int, payload: InvoiceUpdate, user_id: int | None, user_name: str | None) -> Invoice:
    invoice = get_invoice(db, invoice_id)
    if invoice.status == InvoiceStatus.cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể sửa hóa đơn đã hủy")
    if payload.customer_id != invoice.customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change invoice customer")
    if payload.sold_at is not None and not same_datetime_to_second(payload.sold_at, invoice.sold_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change invoice sold time")
    before_data = snapshot_invoice(invoice)

    try:
        apply_stock_change(db, invoice.items, direction=1)

        invoice.status = InvoiceStatus.created
        invoice.note = payload.note
        invoice.items.clear()
        invoice.extra_charges.clear()
        db.flush()
        invoice.items = build_invoice_items(db, payload.items)
        invoice.extra_charges = build_extra_charges(payload.extra_charges)
        recalculate_invoice(invoice)
        db.flush()

        apply_stock_change(db, invoice.items, direction=-1)

        after_data = snapshot_invoice(invoice)
        add_history(
            db,
            invoice,
            InvoiceHistoryAction.updated,
            before_data=before_data,
            after_data=after_data,
            user_id=user_id,
            user_name=user_name,
            reason=payload.reason,
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice update conflicts with existing data") from exc
    return get_invoice(db, invoice.id)


def soft_delete_invoice(db: Session, invoice_id: int, user_id: int | None, user_name: str | None, reason: str | None = None) -> None:
    invoice = get_invoice(db, invoice_id)
    before_data = snapshot_invoice(invoice)
    if invoice.status == InvoiceStatus.created:
        apply_stock_change(db, invoice.items, direction=1)
    invoice.deleted_at = datetime.utcnow()
    after_data = snapshot_invoice(invoice)
    add_history(
        db,
        invoice,
        InvoiceHistoryAction.deleted,
        before_data=before_data,
        after_data=after_data,
        user_id=user_id,
        user_name=user_name,
        reason=reason,
    )
    db.commit()


def cancel_invoice(db: Session, invoice_id: int, user_id: int, user_name: str, reason: str) -> Invoice:
    invoice = db.scalar(invoice_query(invoice_id).where(Invoice.deleted_at.is_(None)).with_for_update())
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if invoice.status == InvoiceStatus.cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hóa đơn đã được hủy trước đó")
    before_data = snapshot_invoice(invoice)
    try:
        apply_stock_change(db, invoice.items, direction=1)
        invoice.status = InvoiceStatus.cancelled
        db.flush()
        add_history(
            db,
            invoice,
            InvoiceHistoryAction.updated,
            before_data=before_data,
            after_data=snapshot_invoice(invoice),
            user_id=user_id,
            user_name=user_name,
            reason=reason,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_invoice(db, invoice.id)


def list_invoice_history(db: Session, invoice_id: int) -> list[InvoiceHistory]:
    get_invoice(db, invoice_id, include_deleted=True)
    stmt = select(InvoiceHistory).where(InvoiceHistory.invoice_id == invoice_id).order_by(InvoiceHistory.created_at.desc())
    return list(db.scalars(stmt).all())
