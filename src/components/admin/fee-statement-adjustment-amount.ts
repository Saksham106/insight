export function amountToMinor(value: string, currency: string): number | null {
  const digits = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  if (fraction.length > digits) return null;
  const amount = Number(whole) * 10 ** digits + Number((fraction + "0".repeat(digits)).slice(0, digits) || 0);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
