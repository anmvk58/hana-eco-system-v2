from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException


VIETNAM_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")


def utc_now() -> datetime:
    """Naive UTC for all database DATETIME columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_naive(value: datetime | None = None) -> datetime:
    """API input: legacy naive datetimes mean Vietnam; offsets are respected."""
    if value is None:
        return utc_now()
    aware = value if value.tzinfo is not None else value.replace(tzinfo=VIETNAM_TIMEZONE)
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def utc_to_vietnam(value: datetime) -> datetime:
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(VIETNAM_TIMEZONE)


def utc_iso(value: datetime) -> str:
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def vietnam_now_naive() -> datetime:
    return datetime.now(VIETNAM_TIMEZONE).replace(tzinfo=None)


def vietnam_local_datetime(value: datetime | None = None) -> datetime:
    if value is None:
        return vietnam_now_naive()
    if value.tzinfo is not None:
        return value.astimezone(VIETNAM_TIMEZONE).replace(tzinfo=None)
    return value


def vietnam_day_utc_bounds(target_date: date) -> tuple[datetime, datetime]:
    start_local = datetime.combine(target_date, time.min, tzinfo=VIETNAM_TIMEZONE)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, start_utc + timedelta(days=1)


def vietnam_local_range_to_utc(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    start_utc = start.replace(tzinfo=VIETNAM_TIMEZONE).astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end.replace(tzinfo=VIETNAM_TIMEZONE).astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def vietnam_date_conditions(column, from_date: date | None, to_date: date | None) -> list:
    """Inclusive business dates, compared to UTC storage with an exclusive end."""
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc")
    conditions = []
    if from_date:
        conditions.append(column >= vietnam_day_utc_bounds(from_date)[0])
    if to_date:
        conditions.append(column < vietnam_day_utc_bounds(to_date)[1])
    return conditions
