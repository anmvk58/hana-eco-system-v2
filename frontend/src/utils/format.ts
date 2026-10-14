import { todayInputValue } from "./time";
export { dateTime, dateOnly, utcDateTime, todayInputValue, localTimeValue, firstDayOfCurrentMonthInputValue, vietnamDateInputValue, timeOnly, shiftCalendarDate } from "./time";

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
