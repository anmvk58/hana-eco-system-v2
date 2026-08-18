from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


VIETNAM_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")


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
