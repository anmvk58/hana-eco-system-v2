from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.schemas.dashboard import DashboardSummary
from app.services import dashboard_service


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "/summary",
    response_model=DashboardSummary,
    dependencies=[Depends(require_permission("dashboard.view"))],
)
def dashboard_summary(
    period: Literal["today", "7days", "month", "year"] = Query(default="today"),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_dashboard_summary(db, period)
