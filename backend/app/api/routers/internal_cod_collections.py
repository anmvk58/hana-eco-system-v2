from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.user import User
from app.schemas.internal_cod_collection import (
    InternalCodCollectionCreate,
    InternalCodCollectionSessionRead,
    InternalCodShipperSummaryRead,
)
from app.services import internal_cod_collection_service


router = APIRouter(prefix="/internal-cod-collections", tags=["internal-cod-collections"])


@router.get("/summary", response_model=list[InternalCodShipperSummaryRead])
def list_shipper_summaries(
    collection_date: date | None = None,
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return internal_cod_collection_service.list_shipper_summaries(db, collection_date)


@router.get("/sessions", response_model=list[InternalCodCollectionSessionRead])
def list_sessions(
    from_date: date | None = None,
    to_date: date | None = None,
    shipper_id: int | None = None,
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return internal_cod_collection_service.list_sessions(db, from_date, to_date, shipper_id)


@router.get("/sessions/{session_id}", response_model=InternalCodCollectionSessionRead)
def get_session(
    session_id: int,
    _: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return internal_cod_collection_service.get_session(db, session_id)


@router.post("/sessions", response_model=InternalCodCollectionSessionRead, status_code=201)
def create_session(
    payload: InternalCodCollectionCreate,
    current_user: User = Depends(require_permission("shipping.manage")),
    db: Session = Depends(get_db),
):
    return internal_cod_collection_service.create_session(db, payload, current_user)
