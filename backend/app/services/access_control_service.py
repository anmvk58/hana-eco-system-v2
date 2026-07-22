from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import permission_codes
from app.core.permissions import ALL_PERMISSION_CODES, PERMISSIONS
from app.core.security import hash_password
from app.models.user import AuthSession, Permission, Role, User
from app.schemas.access_control import RolePayload, UserPayload, UserUpdate


def user_query():
    return select(User).options(selectinload(User.roles).selectinload(Role.permissions))


def role_query():
    return select(Role).options(selectinload(Role.permissions))


def ensure_defaults(db: Session) -> None:
    existing = {item.code: item for item in db.scalars(select(Permission)).all()}
    for definition in PERMISSIONS:
        item = existing.get(definition.code)
        if item:
            item.name = definition.name
            item.module = definition.module
        else:
            item = Permission(code=definition.code, name=definition.name, module=definition.module)
            db.add(item)
            existing[definition.code] = item
    db.flush()

    admin_role = db.scalar(role_query().where(Role.name == "Quản trị hệ thống"))
    if not admin_role:
        admin_role = Role(name="Quản trị hệ thống", description="Toàn quyền hệ thống", is_system=True)
        db.add(admin_role)
    admin_role.permissions = list(existing.values())

    admin = db.scalar(user_query().where(User.username == "admin"))
    if not admin:
        admin = User(username="admin", display_name="Admin", password_hash=hash_password("admin"))
        db.add(admin)
    elif not admin.password_hash:
        admin.password_hash = hash_password("admin")
    if admin_role not in admin.roles:
        admin.roles.append(admin_role)
    db.commit()


def list_permissions(db: Session) -> list[Permission]:
    return list(db.scalars(select(Permission).order_by(Permission.module, Permission.code)).all())


def get_role(db: Session, role_id: int) -> Role:
    role = db.scalar(role_query().where(Role.id == role_id))
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role không tồn tại")
    return role


def list_roles(db: Session) -> list[Role]:
    return list(db.scalars(role_query().order_by(Role.is_system.desc(), Role.name)).all())


def resolve_permissions(db: Session, codes: list[str]) -> list[Permission]:
    unique_codes = set(codes)
    invalid = unique_codes - ALL_PERMISSION_CODES
    if invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Quyền không hợp lệ: {', '.join(sorted(invalid))}")
    permissions = list(db.scalars(select(Permission).where(Permission.code.in_(unique_codes))).all()) if unique_codes else []
    if len(permissions) != len(unique_codes):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Danh mục quyền chưa được khởi tạo")
    return permissions


def save_role(db: Session, payload: RolePayload, role: Role | None = None) -> Role:
    if role and role.is_system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể sửa role quản trị hệ thống")
    role = role or Role()
    role.name = payload.name.strip()
    role.description = payload.description
    role.permissions = resolve_permissions(db, payload.permission_codes)
    db.add(role)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên role đã tồn tại") from exc
    return get_role(db, role.id)


def delete_role(db: Session, role_id: int) -> None:
    role = get_role(db, role_id)
    if role.is_system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể xóa role hệ thống")
    user_count = db.scalar(select(func.count()).select_from(User).where(User.roles.any(Role.id == role_id))) or 0
    if user_count:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role đang được gắn cho người dùng")
    db.delete(role)
    db.commit()


def get_user(db: Session, user_id: int) -> User:
    user = db.scalar(user_query().where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")
    return user


def list_users(db: Session, active_only: bool = False) -> list[User]:
    stmt = user_query()
    if active_only:
        stmt = stmt.where(User.is_active.is_(True))
    return list(db.scalars(stmt.order_by(User.display_name)).unique().all())


def resolve_roles(db: Session, role_ids: list[int]) -> list[Role]:
    unique_ids = set(role_ids)
    roles = list(db.scalars(role_query().where(Role.id.in_(unique_ids))).unique().all()) if unique_ids else []
    if len(roles) != len(unique_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Có role không tồn tại")
    return roles


def save_user(db: Session, payload: UserPayload | UserUpdate, user: User | None = None, current_user: User | None = None) -> User:
    user = user or User()
    was_active_admin = bool(user.id and user.is_active and any(role.is_system for role in user.roles))
    changes = payload.model_dump(exclude_unset=True, exclude={"role_ids", "password"})
    if current_user and user.id == current_user.id and changes.get("is_active") is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự khóa tài khoản đang sử dụng")
    next_roles = resolve_roles(db, payload.role_ids) if payload.role_ids is not None else list(user.roles)
    remains_active_admin = changes.get("is_active", user.is_active) and any(role.is_system for role in next_roles)
    if was_active_admin and not remains_active_admin:
        active_admins = db.scalar(
            select(func.count()).select_from(User).where(User.is_active.is_(True), User.roles.any(Role.is_system.is_(True)))
        ) or 0
        if active_admins <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phải giữ ít nhất một quản trị viên hoạt động")
    for key, value in changes.items():
        setattr(user, key, value.strip() if isinstance(value, str) else value)
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        if user.id:
            db.query(AuthSession).filter(AuthSession.user_id == user.id).delete(synchronize_session=False)
    if user.id and changes.get("is_active") is False:
        db.query(AuthSession).filter(AuthSession.user_id == user.id).delete(synchronize_session=False)
    if payload.role_ids is not None:
        user.roles = next_roles
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên đăng nhập đã tồn tại") from exc
    return get_user(db, user.id)


def deactivate_user(db: Session, user_id: int, current_user: User) -> None:
    user = get_user(db, user_id)
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự khóa tài khoản đang sử dụng")
    if any(role.is_system for role in user.roles):
        active_admins = db.scalar(
            select(func.count()).select_from(User).where(User.is_active.is_(True), User.roles.any(Role.is_system.is_(True)))
        ) or 0
        if active_admins <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phải giữ ít nhất một quản trị viên hoạt động")
    user.is_active = False
    db.query(AuthSession).filter(AuthSession.user_id == user.id).delete(synchronize_session=False)
    db.commit()


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "roles": user.roles,
        "permissions": sorted(permission_codes(user)),
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }
