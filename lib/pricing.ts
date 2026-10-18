import { applyBps } from "./money";

export type PricedLine = { unitPrice: number; modifiersTotal: number; quantity: number };
export type Discount = { type: "PERCENT" | "FIXED"; value: number } | null;
export type PricingRules = { taxRateBps: number; serviceChargeBps: number; taxInclusive: boolean };

export type Totals = {
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  taxTotal: number;
  total: number;
};

export const lineTotal = (l: PricedLine) => (l.unitPrice + l.modifiersTotal) * l.quantity;

/**
 * Pure, shared by the cart UI (instant feedback) and the API (source of
 * truth), so the number the cashier sees is the number that gets charged.
 * Order: subtotal → discount → service charge → tax.
 */
export function computeTotals(lines: PricedLine[], rules: PricingRules, discount: Discount = null): Totals {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const discountTotal = !discount
    ? 0
    : Math.min(subtotal, discount.type === "PERCENT" ? applyBps(subtotal, discount.value) : discount.value);
  const afterDiscount = subtotal - discountTotal;
  const serviceCharge = applyBps(afterDiscount, rules.serviceChargeBps);
  const taxable = afterDiscount + serviceCharge;

  if (rules.taxInclusive) {
    const taxTotal = Math.round(taxable - taxable / (1 + rules.taxRateBps / 10_000));
    return { subtotal, discountTotal, serviceCharge, taxTotal, total: taxable };
  }
  const taxTotal = applyBps(taxable, rules.taxRateBps);
  return { subtotal, discountTotal, serviceCharge, taxTotal, total: taxable + taxTotal };
}

/**
 * Split `total` proportionally to `weights` without losing or inventing a
 * cent (largest-remainder method). Equal split = all weights 1; by-seat split
 * = each seat's subtotal, so tax and service charge are shared fairly.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return allocate(total, weights.map(() => 1));
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rem > 0; k = (k + 1) % order.length, rem--) out[order[k][1]]++;
  return out;
}

export const splitEqual = (total: number, ways: number) =>
  allocate(total, Array.from({ length: Math.max(1, Math.floor(ways)) }, () => 1));
