from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.schemas.report import SoldProductReportRow
from app.services import report_service


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get(
    "/sold-products",
    response_model=list[SoldProductReportRow],
    dependencies=[Depends(require_permission("reports.sold_products.view"))],
)
def sold_products_report(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return report_service.sold_products(db, from_date, to_date)
