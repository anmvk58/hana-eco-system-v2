from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password
from app.models.shipper import Shipper
from app.models.user import AuthSession, Role, User
from app.schemas.shipper import ShipperCreate, ShipperUpdate


SHIPPER_ROLE_NAME = "Shipper nội bộ"


def shipper_query():
    return select(Shipper).options(selectinload(Shipper.user))


def get_shipper(db: Session, shipper_id: int) -> Shipper:
    shipper = db.scalar(shipper_query().where(Shipper.id == shipper_id))
    if not shipper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipper không tồn tại")
    return shipper


def get_current_shipper(db: Session, user_id: int) -> Shipper:
    shipper = db.scalar(shipper_query().where(Shipper.user_id == user_id))
    if not shipper or not shipper.is_active or not shipper.user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản chưa được kích hoạt làm shipper nội bộ")
    return shipper


def list_shippers(db: Session) -> list[Shipper]:
    return list(db.scalars(shipper_query().order_by(Shipper.is_active.desc(), Shipper.id.desc())).all())


def get_shipper_role(db: Session) -> Role:
    role = db.scalar(select(Role).where(Role.name == SHIPPER_ROLE_NAME))
    if not role:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Role shipper chưa được khởi tạo")
    return role


def create_shipper(db: Session, payload: ShipperCreate) -> Shipper:
    try:
        user = User(
            username=payload.username.strip(),
            display_name=payload.display_name.strip(),
            password_hash=hash_password(payload.password),
            is_active=payload.is_active,
            roles=[get_shipper_role(db)],
        )
        shipper = Shipper(
            user=user,
            phone=payload.phone.strip() if payload.phone else None,
            note=payload.note.strip() if payload.note else None,
            is_active=payload.is_active,
        )
        db.add(shipper)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên đăng nhập đã tồn tại") from exc
    return get_shipper(db, shipper.id)


def update_shipper(db: Session, shipper_id: int, payload: ShipperUpdate) -> Shipper:
    shipper = get_shipper(db, shipper_id)
    changes = payload.model_dump(exclude_unset=True, exclude={"password", "display_name", "is_active"})
    for key, value in changes.items():
        setattr(shipper, key, value.strip() if isinstance(value, str) else value)
    if payload.display_name is not None:
        shipper.user.display_name = payload.display_name.strip()
    if payload.password is not None:
        shipper.user.password_hash = hash_password(payload.password)
        db.query(AuthSession).filter(AuthSession.user_id == shipper.user_id).delete(synchronize_session=False)
    if payload.is_active is not None:
        shipper.is_active = payload.is_active
        shipper.user.is_active = payload.is_active
        if not payload.is_active:
            db.query(AuthSession).filter(AuthSession.user_id == shipper.user_id).delete(synchronize_session=False)
    db.commit()
    return get_shipper(db, shipper.id)


def deactivate_shipper(db: Session, shipper_id: int) -> None:
    shipper = get_shipper(db, shipper_id)
    shipper.is_active = False
    shipper.user.is_active = False
    db.query(AuthSession).filter(AuthSession.user_id == shipper.user_id).delete(synchronize_session=False)
    db.commit()
