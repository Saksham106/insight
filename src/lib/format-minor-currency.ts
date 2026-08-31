const ISO_CURRENCY = /^[A-Z]{3}$/;

export function formatMinorCurrency(value: number, currencyInput: string): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid_minor_amount");
  const currency = currencyInput.trim().toUpperCase();
  if (!ISO_CURRENCY.test(currency)) throw new Error("invalid_currency");

  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(value / (10 ** fractionDigits));
}
