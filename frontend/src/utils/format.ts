export function money(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number)} ₫`;
}

export function numberText(value: string | number | null | undefined, fractionDigits = 0) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
  }).format(number);
}

export function normalizeInvoiceCodeSearch(value: string) {
  const trimmedValue = value.trim();
  if (!/^\d{1,4}$/.test(trimmedValue)) return trimmedValue;
  const currentDate = todayInputValue().replace(/-/g, "").slice(2);
  return `HD${currentDate}${trimmedValue.padStart(4, "0")}`;
}

export function normalizeNumberInput(value: string, allowDecimal = true) {
  const withoutSpaces = value.replace(/\s/g, "");
  const withoutThousandSeparators = withoutSpaces.replace(/,/g, "");
  const normalizedDecimal = withoutThousandSeparators;
  const sanitized = normalizedDecimal.replace(/[^0-9.]/g, "");
  if (!allowDecimal) return sanitized.split(".")[0] ?? "";
  const [integerPart, ...decimalParts] = sanitized.split(".");
  const decimalPart = decimalParts.join("");
  return decimalParts.length > 0 ? `${integerPart || "0"}.${decimalPart}` : integerPart;
}

export function formatNumberInput(value: string | number | null | undefined, allowDecimal = true) {
  const raw = String(value ?? "");
  if (!raw) return "";
  const [integerPart, decimalPart] = raw.split(".");
  const formattedInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(integerPart || 0));
  if (!allowDecimal) return formattedInteger;
  if (raw.endsWith(".")) return `${formattedInteger}.`;
  return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "";
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const vietnamValue = hasTimezone ? value : `${value}+07:00`;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(vietnamValue));
}

export function dateOnly(value: string | null | undefined) {
  if (!value) return "";
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const vietnamValue = hasTimezone ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+07:00` : `${value}+07:00`;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(vietnamValue));
}

export function todayInputValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function utcDateTime(value: string | null | undefined) {
  if (!value) return "";
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const utcValue = hasTimezone ? value : `${value}Z`;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(utcValue));
}

export function firstDayOfCurrentMonthInputValue() {
  const today = todayInputValue();
  return `${today.slice(0, 8)}01`;
}

export function localTimeValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}:${values.second}`;
}
