export function money(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(number);
}

export function numberText(value: string | number | null | undefined, fractionDigits = 0) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: fractionDigits,
  }).format(number);
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
  return new Date().toISOString().slice(0, 10);
}

