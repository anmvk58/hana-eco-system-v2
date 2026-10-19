// Fixed-point calculations match backend Decimal / ROUND_HALF_UP. Inputs are
// plain decimal strings; display formatting is kept outside the ledger maths.
function scaled(value: string, places: number) {
  if (!/^\d*(\.\d*)?$/.test(value)) return 0n;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0").slice(0, places) || "0");
}

function decimal(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function supplierLineTotal(quantity: string, price: string) {
  return decimal((scaled(quantity, 3) * scaled(price, 2) + 500n) / 1000n);
}

export function supplierSum(amounts: string[]) {
  return decimal(amounts.reduce((sum, amount) => sum + (amount.startsWith("-") ? -scaled(amount.slice(1), 2) : scaled(amount, 2)), 0n));
}
