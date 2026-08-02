from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.schemas.shipper import ShipperCreate, ShipperRead, ShipperUpdate
from app.services import shipper_service


router = APIRouter(prefix="/shippers", tags=["shippers"])


@router.get("", response_model=list[ShipperRead], dependencies=[Depends(require_permission("shippers.view"))])
def list_shippers(db: Session = Depends(get_db)):
    return shipper_service.list_shippers(db)


@router.post("", response_model=ShipperRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("shippers.create"))])
def create_shipper(payload: ShipperCreate, db: Session = Depends(get_db)):
    return shipper_service.create_shipper(db, payload)


@router.put("/{shipper_id}", response_model=ShipperRead, dependencies=[Depends(require_permission("shippers.update"))])
def update_shipper(shipper_id: int, payload: ShipperUpdate, db: Session = Depends(get_db)):
    return shipper_service.update_shipper(db, shipper_id, payload)


@router.delete("/{shipper_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("shippers.delete"))])
def deactivate_shipper(shipper_id: int, db: Session = Depends(get_db)):
    shipper_service.deactivate_shipper(db, shipper_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
