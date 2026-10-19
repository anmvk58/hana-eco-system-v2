from typing import Literal
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.user import User
from app.schemas.supplier_debt import (
    DebtCancelPayload, DebtEntryPage, DebtEntryPayload, DebtEntryRead, DebtEntryUpdate,
    DebtHistoryRead, DebtPaymentPage, DebtPaymentPayload, DebtPaymentRead, SupplierPayload, SupplierRead,
)
from app.services import supplier_debt_service as service

router = APIRouter(prefix="/supplier-debts", tags=["supplier-debts"])
view = require_permission("supplier_debts.view")
manage = require_permission("supplier_debts.manage")
pay = require_permission("supplier_debts.pay")


@router.get("/suppliers", response_model=list[SupplierRead])
def suppliers(from_date: date | None = None, to_date: date | None = None, _: User = Depends(view), db: Session = Depends(get_db)):
    return service.list_suppliers(db, from_date=from_date, to_date=to_date)


@router.post("/suppliers", response_model=SupplierRead, status_code=201)
def create_supplier(payload: SupplierPayload, actor: User = Depends(manage), db: Session = Depends(get_db)):
    return service.save_supplier(db, payload, actor)


@router.put("/suppliers/{supplier_id}", response_model=SupplierRead)
def update_supplier(supplier_id: int, payload: SupplierPayload, actor: User = Depends(manage), db: Session = Depends(get_db)):
    return service.save_supplier(db, payload, actor, supplier_id)


@router.get("/entries", response_model=DebtEntryPage)
def entries(supplier_id: int | None = Query(default=None, gt=0), state: Literal["pending", "paid", "cancelled", "all"] = "pending",
            page: int = Query(default=1, ge=1), page_size: int = Query(default=30, ge=1, le=100),
            from_date: date | None = None, to_date: date | None = None,
            _: User = Depends(view), db: Session = Depends(get_db)):
    return service.list_entries(db, supplier_id, state, page, page_size, from_date, to_date)


@router.post("/entries", response_model=DebtEntryRead, status_code=201)
def create_entry(payload: DebtEntryPayload, actor: User = Depends(manage), db: Session = Depends(get_db)):
    return service.save_entry(db, payload, actor)


@router.put("/entries/{entry_id}", response_model=DebtEntryRead)
def update_entry(entry_id: int, payload: DebtEntryUpdate, actor: User = Depends(manage), db: Session = Depends(get_db)):
    return service.save_entry(db, payload, actor, entry_id)


@router.post("/entries/{entry_id}/cancel", response_model=DebtEntryRead)
def cancel_entry(entry_id: int, payload: DebtCancelPayload, actor: User = Depends(manage), db: Session = Depends(get_db)):
    return service.cancel_entry(db, entry_id, payload, actor)


@router.get("/payments", response_model=DebtPaymentPage)
def payments(supplier_id: int = Query(gt=0), page: int = Query(default=1, ge=1), page_size: int = Query(default=30, ge=1, le=100),
             from_date: date | None = None, to_date: date | None = None,
             _: User = Depends(view), db: Session = Depends(get_db)):
    return service.list_payments(db, supplier_id, page, page_size, from_date, to_date)


@router.post("/payments", response_model=DebtPaymentRead, status_code=201)
def create_payment(payload: DebtPaymentPayload, actor: User = Depends(pay), db: Session = Depends(get_db)):
    return service.create_payment(db, payload, actor)


@router.post("/payments/{payment_id}/undo", response_model=DebtPaymentRead)
def undo_payment(payment_id: int, payload: DebtCancelPayload, actor: User = Depends(pay), db: Session = Depends(get_db)):
    return service.undo_payment(db, payment_id, payload, actor)


@router.get("/history", response_model=list[DebtHistoryRead])
def history(supplier_id: int = Query(gt=0), entry_id: int | None = None, payment_id: int | None = None,
            _: User = Depends(view), db: Session = Depends(get_db)):
    return service.list_history(db, supplier_id, entry_id, payment_id)
