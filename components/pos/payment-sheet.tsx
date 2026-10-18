"use client";

import { Banknote, CheckCircle2, CreditCard, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { allocate } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Method = "CASH" | "CARD" | "MOBILE";
export type SplitChoice = { mode: "FULL" } | { mode: "EQUAL"; ways: number } | { mode: "BY_SEAT" };
export type Tender = { method: Method; tendered?: number };

const METHODS: { id: Method; label: string; icon: typeof Banknote }[] = [
  { id: "CASH", label: "Cash", icon: Banknote },
  { id: "CARD", label: "Card", icon: CreditCard },
  { id: "MOBILE", label: "Mobile", icon: Smartphone },
];

export function PaymentSheet({
  open,
  onOpenChange,
  total,
  currency,
  seatTotals,
  onPay,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  currency: string;
  /** subtotal per seat (for by-seat preview) — empty when no seats assigned */
  seatTotals: number[];
  onPay: (split: SplitChoice, tenders: Tender[]) => Promise<void>;
}) {
  const [split, setSplit] = useState<SplitChoice>({ mode: "FULL" });
  const [methods, setMethods] = useState<Method[]>([]);
  const [cash, setCash] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => formatMoney(n, currency);

  const shares = useMemo(
    () =>
      split.mode === "FULL" ? [total] : split.mode === "EQUAL" ? allocate(total, Array(split.ways).fill(1)) : allocate(total, seatTotals),
    [split, total, seatTotals],
  );
  const methodAt = (i: number) => methods[i] ?? "CARD";
  const ready = shares.every((s, i) => methodAt(i) !== "CASH" || (cash[i] ?? 0) >= s);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await onPay(split, shares.map((_, i) => ({ method: methodAt(i), tendered: methodAt(i) === "CASH" ? cash[i] : undefined })));
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setSplit({ mode: "FULL" });
        setMethods([]);
        setCash({});
        onOpenChange(false);
      }, 1100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="center" title={`Charge ${fmt(total)}`}>
      {done ? (
        <div className="grid place-items-center gap-3 py-16 animate-arrive" role="status">
          <CheckCircle2 className="size-20 text-free" />
          <p className="text-2xl font-semibold">Paid</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Split">
            {(
              [
                { c: { mode: "FULL" }, label: "One bill" },
                { c: { mode: "EQUAL", ways: split.mode === "EQUAL" ? split.ways : 2 }, label: "Split equally" },
                { c: { mode: "BY_SEAT" }, label: "By seat", disabled: seatTotals.length < 2 },
              ] as { c: SplitChoice; label: string; disabled?: boolean }[]
            ).map(({ c, label, disabled }) => (
              <button
                key={c.mode}
                role="radio"
                aria-checked={split.mode === c.mode}
                disabled={disabled}
                onClick={() => setSplit(c)}
                className={cn(
                  "h-14 rounded-xl border font-medium transition-colors disabled:opacity-40",
                  split.mode === c.mode ? "border-primary bg-accent" : "hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {split.mode === "EQUAL" && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="icon" onClick={() => setSplit({ mode: "EQUAL", ways: Math.max(2, split.ways - 1) })}>
                −
              </Button>
              <span className="w-28 text-center text-lg font-semibold">{split.ways} ways</span>
              <Button variant="outline" size="icon" onClick={() => setSplit({ mode: "EQUAL", ways: Math.min(20, split.ways + 1) })}>
                +
              </Button>
            </div>
          )}

          <ol className="flex flex-col gap-3">
            {shares.map((amount, i) => (
              <li key={i} className="rounded-xl border p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-muted-foreground">
                    {shares.length > 1 ? (split.mode === "BY_SEAT" ? `Seat ${i + 1}` : `Bill ${i + 1} of ${shares.length}`) : "Amount due"}
                  </span>
                  <span className="text-xl font-semibold tabular-nums">{fmt(amount)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map(({ id, label, icon: Icon }) => (
                    <Button
                      key={id}
                      variant={methodAt(i) === id ? "primary" : "secondary"}
                      onClick={() => setMethods((m) => Object.assign([...m], { [i]: id }))}
                    >
                      <Icon /> {label}
                    </Button>
                  ))}
                </div>
                {methodAt(i) === "CASH" && (
                  <CashPad amount={amount} value={cash[i] ?? 0} onChange={(v) => setCash((c) => ({ ...c, [i]: v }))} fmt={fmt} />
                )}
              </li>
            ))}
          </ol>

          {error && <p className="rounded-xl bg-occupied/10 p-3 text-occupied" role="alert">{error}</p>}
          <Button size="xl" disabled={!ready || busy} onClick={pay}>
            {busy ? "Processing…" : `Confirm ${fmt(total)}`}
          </Button>
        </>
      )}
    </Sheet>
  );
}

/** Quick-tender buttons: exact, then next round notes. */
function CashPad({ amount, value, onChange, fmt }: { amount: number; value: number; onChange: (v: number) => void; fmt: (n: number) => string }) {
  const quick = [...new Set([amount, ...[500, 1000, 2000, 5000, 10000].map((n) => Math.ceil(amount / n) * n)])].slice(0, 4);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {quick.map((q) => (
          <Button key={q} variant={value === q ? "primary" : "outline"} onClick={() => onChange(q)}>
            {q === amount ? "Exact" : fmt(q)}
          </Button>
        ))}
      </div>
      {value >= amount && (
        <p className="text-right text-lg">
          Change <span className="font-semibold tabular-nums">{fmt(value - amount)}</span>
        </p>
      )}
    </div>
  );
}
