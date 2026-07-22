from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_token, new_session_token, verify_password
from app.models.user import AuthSession, User
from app.schemas.access_control import LoginPayload
from app.services.access_control_service import serialize_user, user_query


SESSION_LIFETIME = timedelta(hours=24)


def login(db: Session, payload: LoginPayload) -> dict:
    user = db.scalar(user_query().where(User.username == payload.username.strip()))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tên đăng nhập hoặc mật khẩu không đúng")

    token = new_session_token()
    expires_at = datetime.utcnow() + SESSION_LIFETIME
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= datetime.utcnow()))
    db.add(AuthSession(token_hash=hash_token(token), user_id=user.id, expires_at=expires_at))
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": serialize_user(user),
    }


def logout(db: Session, token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    db.commit()
