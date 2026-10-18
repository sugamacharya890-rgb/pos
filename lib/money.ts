/** All amounts are integer minor units (cents). */
export function formatMoney(minor: number, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

/** Headline numbers: "NPR 1.17M" — full value belongs in a title/tooltip. */
export function formatMoneyCompact(minor: number, currency = "USD", locale = "en-US") {
  if (Math.abs(minor) < 100_000_00) return formatMoney(minor, currency, locale);
  return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 2 }).format(minor / 100);
}

/** Round half away from zero — banker's rounding surprises cashiers. */
export const applyBps = (amount: number, bps: number) =>
  Math.sign(amount) * Math.round((Math.abs(amount) * bps) / 10_000);
