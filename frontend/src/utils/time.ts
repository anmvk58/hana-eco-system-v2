/** UTC instants at the API boundary; Vietnam calendar dates everywhere in the UI. */
export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function parseTimestamp(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+07:00`);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

export function vietnamDateInputValue(value: string | Date = new Date()): string {
  const date = typeof value === "string" ? parseTimestamp(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: VIETNAM_TIME_ZONE,
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function todayInputValue(now = new Date()) { return vietnamDateInputValue(now); }

export function dateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short", timeStyle: "short", timeZone: VIETNAM_TIME_ZONE,
  }).format(parseTimestamp(value));
}

export const utcDateTime = dateTime;

export function dateOnly(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: VIETNAM_TIME_ZONE,
  }).format(parseTimestamp(value));
}

export function timeOnly(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: VIETNAM_TIME_ZONE,
  }).format(parseTimestamp(value));
}

export function firstDayOfCurrentMonthInputValue() { return `${todayInputValue().slice(0, 8)}01`; }

export function localTimeValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: VIETNAM_TIME_ZONE,
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.hour}:${fields.minute}:${fields.second}`;
}

export function shiftCalendarDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function parseCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function calendarDateValue(date: Date) { return date.toISOString().slice(0, 10); }
