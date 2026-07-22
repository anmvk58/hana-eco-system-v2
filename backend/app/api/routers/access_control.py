from fastapi import APIRouter, Depends, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.api.deps import bearer_scheme, get_current_user, require_permission
from app.database import get_db
from app.models.user import User
from app.schemas.access_control import CurrentUserRead, LoginPayload, LoginRead, PermissionRead, RolePayload, RoleRead, UserPayload, UserRead, UserUpdate
from app.services import access_control_service, auth_service


router = APIRouter(tags=["access-control"])


@router.post("/auth/login", response_model=LoginRead)
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    return auth_service.login(db, payload)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_service.logout(db, credentials.credentials)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/auth/me", response_model=CurrentUserRead)
def current_user(user: User = Depends(get_current_user)):
    return access_control_service.serialize_user(user)


@router.get("/permissions", response_model=list[PermissionRead], dependencies=[Depends(require_permission("roles.view"))])
def list_permissions(db: Session = Depends(get_db)):
    return access_control_service.list_permissions(db)


@router.get("/roles", response_model=list[RoleRead], dependencies=[Depends(require_permission("roles.view"))])
def list_roles(db: Session = Depends(get_db)):
    return access_control_service.list_roles(db)


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("roles.create"))])
def create_role(payload: RolePayload, db: Session = Depends(get_db)):
    return access_control_service.save_role(db, payload)


@router.put("/roles/{role_id}", response_model=RoleRead, dependencies=[Depends(require_permission("roles.update"))])
def update_role(role_id: int, payload: RolePayload, db: Session = Depends(get_db)):
    return access_control_service.save_role(db, payload, access_control_service.get_role(db, role_id))


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("roles.delete"))])
def delete_role(role_id: int, db: Session = Depends(get_db)):
    access_control_service.delete_role(db, role_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[UserRead], dependencies=[Depends(require_permission("users.view"))])
def list_users(db: Session = Depends(get_db)):
    return [access_control_service.serialize_user(user) for user in access_control_service.list_users(db)]


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("users.create"))])
def create_user(payload: UserPayload, db: Session = Depends(get_db)):
    return access_control_service.serialize_user(access_control_service.save_user(db, payload))


@router.put("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: User = Depends(require_permission("users.update")),
    db: Session = Depends(get_db),
):
    return access_control_service.serialize_user(
        access_control_service.save_user(db, payload, access_control_service.get_user(db, user_id), current_user)
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_permission("users.delete")),
    db: Session = Depends(get_db),
):
    access_control_service.deactivate_user(db, user_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
