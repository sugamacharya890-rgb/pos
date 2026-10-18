"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Peak hours — one series (revenue by local hour), so one hue, no legend; the
 * title names it. Thin bars, 4px rounded tops anchored to the baseline, 2px
 * gaps, hover/focus tooltip, and a table fallback for screen readers.
 */
export function PeakHours({ byHour, currency }: { byHour: number[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...byHour);
  const peak = byHour.indexOf(Math.max(...byHour));
  const hours = byHour.map((v, h) => ({ h, v })).slice(6); // 06:00 → 23:00 service window
  const fmtH = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-semibold">Peak hours</h3>
        <p className="text-sm text-muted-foreground">
          Busiest: <span className="font-medium text-foreground">{byHour[peak] ? fmtH(peak) : "—"}</span>
        </p>
      </div>
      <div className="relative flex h-48 items-end gap-[2px] border-b" role="img" aria-label="Revenue by hour">
        {hours.map(({ h, v }) => (
          <div
            key={h}
            tabIndex={0}
            onMouseEnter={() => setHover(h)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(h)}
            onBlur={() => setHover(null)}
            className="group relative flex h-full flex-1 items-end outline-none"
          >
            <div
              className={cn("w-full rounded-t-[4px] bg-primary/75 transition-colors", (hover === h || h === peak) && "bg-primary")}
              style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0 }}
            />
            {hover === h && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border bg-card px-2.5 py-1.5 text-sm shadow-lg">
                <span className="text-muted-foreground">{fmtH(h)}</span> <span className="font-semibold tabular-nums">{formatMoney(v, currency)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        {[6, 10, 14, 18, 22].map((h) => (
          <span key={h}>{fmtH(h)}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Revenue by hour</caption>
        <tbody>
          {hours.map(({ h, v }) => (
            <tr key={h}>
              <th>{fmtH(h)}</th>
              <td>{formatMoney(v, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

type Row = { label: string; value: number };

/** Sales breakdown, switchable between payment method and category. */
export function Breakdown({ byMethod, byCategory, currency }: { byMethod: Row[]; byCategory: Row[]; currency: string }) {
  const [tab, setTab] = useState<"method" | "category">("method");
  const rows = (tab === "method" ? byMethod : byCategory).toSorted((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Sales breakdown</h3>
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist">
          {(["method", "category"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("h-10 rounded-lg px-3 text-sm font-medium", tab === t ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {t === "method" ? "Payment method" : "Category"}
            </button>
          ))}
        </div>
      </div>
      <ul className="space-y-3">
        {rows.length === 0 && <li className="py-6 text-center text-muted-foreground">No sales in this range.</li>}
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 flex justify-between text-[15px]">
              <span>{r.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{formatMoney(r.value, currency)}</span>{" "}
                <span className="text-muted-foreground">{Math.round((r.value / total) * 100)}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.value / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
