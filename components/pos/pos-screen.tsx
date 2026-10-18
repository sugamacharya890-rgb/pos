"use client";

import { ChefHat, Minus, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { computeTotals, lineTotal, type PricingRules } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-store";
import { ModifierSheet } from "./modifier-sheet";
import { PaymentSheet, type SplitChoice, type Tender } from "./payment-sheet";
import type { ActiveOrderDTO, CategoryDTO, MenuItemDTO } from "./types";

type Props = {
  mode: "checkout" | "order";
  apiBase: string;
  currency: string;
  rules: PricingRules;
  categories: CategoryDTO[];
  items: MenuItemDTO[];
  /** checkout: open table bills the cashier can settle */
  activeOrders?: ActiveOrderDTO[];
  /** order mode: the table being served */
  table?: { id: string; label: string; seats: number };
  /** where to go after "Send to kitchen" */
  doneHref?: string;
};

/**
 * ┌──────────┬───────────────────────────────┬──────────────┐
 * │ category │ search ( / )                  │ cart / bill  │
 * │ rail     │ item grid (tap = add)         │ totals       │
 * │          │                               │ [Charge]     │
 * └──────────┴───────────────────────────────┴──────────────┘
 */
export function PosScreen({ mode, apiBase, currency, rules, categories, items, activeOrders = [], table, doneHref }: Props) {
  const router = useRouter();
  const fmt = (n: number) => formatMoney(n, currency);
  const { lines, add, inc, remove, clear, seat, setSeat, lastKey } = useCart();

  const [category, setCategory] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const [modItem, setModItem] = useState<MenuItemDTO | null>(null);
  const [paying, setPaying] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOrder = activeOrders.find((o) => o.id === selectedOrderId) ?? null;

  const search = useCallback(
    (term: string) => items.filter((i) => i.name.toLowerCase().includes(term) || i.shortcode?.toLowerCase() === term),
    [items],
  );
  // Rendering uses the deferred term (keeps typing smooth on slow tablets)…
  const visible = useMemo(() => {
    if (q) return search(q);
    return category === "all" ? items : items.filter((i) => i.categoryId === category);
  }, [items, q, category, search]);

  const catColor = useMemo(() => new Map(categories.map((c) => [c.id, c.color])), [categories]);
  const cartTotals = useMemo(() => computeTotals(lines, rules), [lines, rules]);
  const totals = selectedOrder ?? cartTotals;

  const pick = useCallback(
    (item: MenuItemDTO) => {
      setSelectedOrderId(null);
      if (item.modifierGroups.length) return setModItem(item);
      add(item);
      setFlash(item.id);
    },
    [add],
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === searchRef.current;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        setQuery("");
        searchRef.current?.blur();
      } else if (!typing && lastKey && (e.key === "+" || e.key === "=")) inc(lastKey, 1);
      else if (!typing && lastKey && e.key === "-") inc(lastKey, -1);
      else if ((e.key === "Enter" && (e.ctrlKey || e.metaKey)) || e.key === "F2") {
        e.preventDefault();
        primaryAction();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 350);
    return () => clearTimeout(t);
  }, [flash]);

  // ── Server calls ───────────────────────────────────────────────────────────
  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  };

  const orderPayload = () => ({
    idempotencyKey: crypto.randomUUID(),
    type: table ? "DINE_IN" : "TAKEAWAY",
    tableId: table?.id,
    lines: lines.map((l) => ({
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      modifierIds: l.modifiers.map((m) => m.id),
      seatNumber: l.seatNumber,
      notes: l.notes,
    })),
  });

  const sendToKitchen = async () => {
    if (!lines.length || sending) return;
    setSending(true);
    try {
      await post(`${apiBase}/orders`, orderPayload());
      clear();
      if (doneHref) router.push(doneHref);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const pay = async (split: SplitChoice, tenders: Tender[]) => {
    const orderId = selectedOrder?.id ?? (await post(`${apiBase}/orders`, orderPayload())).orderId;
    await post(`${apiBase}/orders/${orderId}/payments`, { idempotencyKey: crypto.randomUUID(), split, tenders });
    clear();
    setSelectedOrderId(null);
    router.refresh();
  };

  function primaryAction() {
    if (mode === "order") return sendToKitchen();
    if (selectedOrder || lines.length) setPaying(true);
  }

  const seatTotals = useMemo(() => {
    const src = selectedOrder ? selectedOrder.items : lines.map((l) => ({ seatNumber: l.seatNumber ?? null, lineTotal: lineTotal(l) }));
    const bySeat = new Map<number, number>();
    src.forEach((l) => bySeat.set(l.seatNumber ?? 0, (bySeat.get(l.seatNumber ?? 0) ?? 0) + l.lineTotal));
    return [...bySeat.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }, [selectedOrder, lines]);

  const empty = !selectedOrder && lines.length === 0;

  return (
    <div className="grid h-full grid-cols-[auto_1fr] grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[auto_1fr_360px] md:grid-rows-[minmax(0,1fr)] xl:grid-cols-[auto_1fr_400px]">
      {/* Category rail */}
      <aside className="flex w-28 flex-col gap-2 overflow-y-auto border-r p-2 lg:w-40">
        {[{ id: "all", name: "All", color: null } as CategoryDTO, ...categories].map((c) => (
          <button
            key={c.id}
            onClick={() => (setCategory(c.id), setQuery(""))}
            aria-pressed={category === c.id && !q}
            className={cn(
              "relative flex min-h-16 items-center rounded-xl px-3 text-left font-semibold transition-colors",
              category === c.id && !q ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {c.color && <span className="absolute inset-y-3 left-0 w-1 rounded-full" style={{ background: c.color }} />}
            {c.name}
          </button>
        ))}
      </aside>

      {/* Menu */}
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center gap-2 border-b p-3">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // …but Enter must act on exactly what was typed, never a lagging value.
                const term = query.trim().toLowerCase();
                if (e.key !== "Enter" || e.ctrlKey || e.metaKey || !term) return;
                const hits = search(term);
                const hit = hits.find((i) => i.shortcode?.toLowerCase() === term) ?? hits[0];
                if (hit) {
                  pick(hit);
                  setQuery("");
                }
              }}
              placeholder="Search menu or type a code…"
              className="h-14 w-full rounded-xl border bg-card pl-12 pr-16 text-lg outline-none focus:border-primary"
            />
            <kbd className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md border px-2 py-0.5 text-sm text-muted-foreground">/</kbd>
          </label>
        </div>
        <div className="grid flex-1 auto-rows-[7.5rem] grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] content-start gap-3 overflow-y-auto p-3">
          {visible.map((item) => (
            <button
              key={item.id}
              onClick={() => pick(item)}
              className={cn(
                "group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-3 text-left shadow-sm transition-transform active:scale-[0.97]",
                flash === item.id && "animate-pulse-ring",
              )}
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: catColor.get(item.categoryId) ?? "var(--border)" }}
              />
              <span className="line-clamp-2 text-[17px] font-semibold leading-snug">{item.name}</span>
              <span className="flex items-end justify-between">
                <span className="text-lg font-semibold tabular-nums">{fmt(item.price)}</span>
                {item.shortcode && <span className="text-xs text-muted-foreground">{item.shortcode}</span>}
              </span>
            </button>
          ))}
          {visible.length === 0 && <p className="col-span-full py-16 text-center text-muted-foreground">No items match “{query}”.</p>}
        </div>
      </section>

      {/* Cart */}
      <aside className="col-span-2 flex max-h-[55dvh] min-h-0 flex-col border-t bg-card md:col-span-1 md:max-h-none md:border-l md:border-t-0">
        {mode === "checkout" && activeOrders.length > 0 && (
          <div className="border-b p-3">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Active tables</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {activeOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrderId(o.id === selectedOrderId ? null : o.id)}
                  aria-pressed={o.id === selectedOrderId}
                  className={cn(
                    "flex h-14 shrink-0 flex-col justify-center rounded-xl border px-4 text-left",
                    o.id === selectedOrderId ? "border-primary bg-accent" : "hover:bg-muted",
                  )}
                >
                  <span className="font-semibold leading-tight">{o.tableLabel ?? `#${o.number}`}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{fmt(o.total)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <header className="flex h-16 items-center justify-between border-b px-4">
          <h2 className="text-lg font-semibold">
            {selectedOrder
              ? `${selectedOrder.tableLabel ?? "Order"} · #${selectedOrder.number}`
              : table
                ? `Table ${table.label}`
                : "New order"}
          </h2>
          {!empty && (
            <Button variant="ghost" size="icon" aria-label="Clear" onClick={() => (selectedOrder ? setSelectedOrderId(null) : clear())}>
              {selectedOrder ? <X /> : <Trash2 />}
            </Button>
          )}
        </header>

        {table && (
          <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Seat</span>
            <SeatPicker seats={table.seats} value={seat} onChange={setSeat} />
          </div>
        )}

        <ul className="flex-1 overflow-y-auto">
          {empty && (
            <li className="grid h-full place-items-center p-8 text-center text-muted-foreground">
              <div>
                <ShoppingBag className="mx-auto mb-3 size-10 opacity-40" />
                Tap items to add them.
                <br />
                <span className="text-sm">
                  <kbd>/</kbd> search · <kbd>+</kbd>/<kbd>−</kbd> qty · <kbd>F2</kbd> {mode === "order" ? "send" : "charge"}
                </span>
              </div>
            </li>
          )}
          {selectedOrder?.items.map((l) => (
            <li key={l.id} className="flex items-start gap-3 border-b px-4 py-3">
              <span className="w-6 text-right font-semibold tabular-nums">{l.quantity}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{l.name}</p>
                {l.modifiers.length > 0 && <p className="text-sm text-muted-foreground">{l.modifiers.join(", ")}</p>}
                {l.seatNumber && <p className="text-xs text-muted-foreground">Seat {l.seatNumber}</p>}
              </div>
              <span className="tabular-nums">{fmt(l.lineTotal)}</span>
            </li>
          ))}
          {!selectedOrder &&
            lines.map((l) => (
              <li key={l.key} className={cn("animate-arrive border-b px-4 py-3", l.key === lastKey && "bg-accent/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{l.name}</p>
                    {l.modifiers.length > 0 && (
                      <p className="text-sm text-muted-foreground">{l.modifiers.map((m) => m.name).join(", ")}</p>
                    )}
                    {l.seatNumber && <p className="text-xs text-muted-foreground">Seat {l.seatNumber}</p>}
                  </div>
                  <span className="font-medium tabular-nums">{fmt(lineTotal(l))}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Decrease" onClick={() => inc(l.key, -1)}>
                    <Minus />
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">{l.quantity}</span>
                  <Button variant="outline" size="icon" aria-label="Increase" onClick={() => inc(l.key, 1)}>
                    <Plus />
                  </Button>
                  <Button variant="ghost" size="icon" className="ml-auto" aria-label="Remove" onClick={() => remove(l.key)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
        </ul>

        <dl className="space-y-1.5 border-t p-4 text-[15px]">
          <Row label="Subtotal" value={fmt(totals.subtotal)} />
          {totals.discountTotal > 0 && <Row label="Discount" value={`−${fmt(totals.discountTotal)}`} />}
          {rules.serviceChargeBps > 0 && <Row label={`Service ${rules.serviceChargeBps / 100}%`} value={fmt(totals.serviceCharge)} />}
          <Row label={`Tax ${rules.taxRateBps / 100}%${rules.taxInclusive ? " (incl.)" : ""}`} value={fmt(totals.taxTotal)} />
          <div className="flex items-baseline justify-between pt-2 text-2xl font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{fmt(totals.total)}</dd>
          </div>
        </dl>

        <div className="p-4 pt-0">
          {mode === "order" ? (
            <Button size="xl" className="w-full" disabled={empty || sending} onClick={sendToKitchen}>
              <ChefHat /> {sending ? "Sending…" : "Send to kitchen"}
            </Button>
          ) : (
            <Button size="xl" className="w-full" disabled={empty} onClick={() => setPaying(true)}>
              Charge {fmt(totals.total)}
            </Button>
          )}
        </div>
      </aside>

      <ModifierSheet
        item={modItem}
        currency={currency}
        onClose={() => setModItem(null)}
        onConfirm={(mods) => {
          if (modItem) add(modItem, mods);
          setModItem(null);
        }}
      />
      <PaymentSheet open={paying} onOpenChange={setPaying} total={totals.total} currency={currency} seatTotals={seatTotals} onPay={pay} />
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-muted-foreground">
    <dt>{label}</dt>
    <dd className="tabular-nums text-foreground">{value}</dd>
  </div>
);

function SeatPicker({ seats, value, onChange }: { seats: number; value?: number; onChange: (s?: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-xl border p-1" role="radiogroup" aria-label="Seat">
      <button
        role="radio"
        aria-checked={value === undefined}
        onClick={() => onChange(undefined)}
        className={cn("h-12 rounded-lg px-3 text-sm font-medium", value === undefined ? "bg-accent" : "text-muted-foreground")}
      >
        Shared
      </button>
      {Array.from({ length: seats }, (_, i) => i + 1).map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={cn("size-12 rounded-lg font-semibold", value === s ? "bg-accent" : "text-muted-foreground")}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
