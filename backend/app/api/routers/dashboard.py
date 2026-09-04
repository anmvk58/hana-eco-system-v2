from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.schemas.dashboard import (
    DashboardCustomerSummary,
    DashboardOrderStatusCharts,
    DashboardProductSummary,
    DashboardSummary,
)
from app.services import dashboard_service


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "/summary",
    response_model=DashboardSummary,
    dependencies=[Depends(require_permission("dashboard.view"))],
)
def dashboard_summary(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_dashboard_summary(db, from_date, to_date)


@router.get(
    "/top-products",
    response_model=list[DashboardProductSummary],
    dependencies=[Depends(require_permission("dashboard.view"))],
)
def dashboard_top_products(
    metric: Literal["revenue", "quantity"] = Query(default="quantity"),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_top_products(db, metric, from_date, to_date)


@router.get(
    "/top-customers",
    response_model=list[DashboardCustomerSummary],
    dependencies=[Depends(require_permission("dashboard.view"))],
)
def dashboard_top_customers(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_top_customers(db, from_date, to_date)


@router.get(
    "/order-status-charts",
    response_model=DashboardOrderStatusCharts,
    dependencies=[Depends(require_permission("dashboard.view"))],
)
def dashboard_order_status_charts(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_dashboard_order_status_charts(db, from_date, to_date)
