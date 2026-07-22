from datetime import datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.core.security import hash_token
from app.models.user import AuthSession, User


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Vui lòng đăng nhập")
    auth_session = db.scalar(
        select(AuthSession)
        .options(selectinload(AuthSession.user).selectinload(User.roles))
        .where(AuthSession.token_hash == hash_token(credentials.credentials), AuthSession.expires_at > datetime.utcnow())
    )
    user = auth_session.user if auth_session else None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    return user


def permission_codes(user: User) -> set[str]:
    return {permission.code for role in user.roles for permission in role.permissions}


def require_permission(code: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if code not in permission_codes(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền thực hiện chức năng này")
        return current_user

    return dependency


def require_any_permission(*codes: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if permission_codes(current_user).isdisjoint(codes):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền thực hiện chức năng này")
        return current_user

    return dependency

