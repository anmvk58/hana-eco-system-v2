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
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function dateOnly(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
  }).format(new Date(value));
}

export function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function firstDayOfCurrentMonthInputValue() {
  const today = todayInputValue();
  return `${today.slice(0, 8)}01`;
}

export function localTimeValue(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
