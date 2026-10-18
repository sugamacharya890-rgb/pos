"use client";

import { ArrowRightLeft, Check, ClipboardPlus, Combine, Move, Receipt, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { useChannel } from "@/lib/realtime/client";
import { cn } from "@/lib/utils";

type Status = "FREE" | "OCCUPIED" | "RESERVED" | "NEEDS_CLEANING";
export type FloorTable = {
  id: string;
  floorAreaId: string;
  label: string;
  seats: number;
  shape: "SQUARE" | "ROUND" | "RECTANGLE" | "BOOTH";
  posX: number;
  posY: number;
  width: number;
  height: number;
  status: Status;
  version: number;
  mergedIntoLabel: string | null;
  order: { number: number; total: number; guestCount: number; openedAt: string; items: { name: string; quantity: number }[] } | null;
};
export type FloorArea = { id: string; name: string; width: number; height: number };

export const STATUS: Record<Status, { label: string; cls: string; dot: string }> = {
  FREE: { label: "Free", cls: "border-free bg-free/12 text-free", dot: "bg-free" },
  OCCUPIED: { label: "Occupied", cls: "border-occupied bg-occupied/12 text-occupied", dot: "bg-occupied" },
  RESERVED: { label: "Reserved", cls: "border-reserved bg-reserved/18 text-[color-mix(in_oklch,var(--status-reserved)_55%,var(--foreground))]", dot: "bg-reserved" },
  NEEDS_CLEANING: { label: "Cleaning", cls: "border-cleaning bg-cleaning/12 text-cleaning", dot: "bg-cleaning" },
};

export function FloorPlan({
  org,
  location,
  apiBase,
  areas,
  initialTables,
  currency,
  canEdit,
  canTakeOrder,
}: {
  org: string;
  location: string;
  apiBase: string;
  areas: FloorArea[];
  initialTables: FloorTable[];
  currency: string;
  canEdit: boolean;
  canTakeOrder: boolean;
}) {
  const router = useRouter();
  const [tables, setTables] = useState(initialTables);
  const [areaId, setAreaId] = useState(areas[0]?.id);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<"merge" | "transfer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; scale: number; moved: boolean } | null>(null);

  useEffect(() => setTables(initialTables), [initialTables]);

  useChannel(
    { org, location, channel: "floor" },
    {
      "table.updated": (t) => {
        setTables((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...t, status: t.status as Status } : x)));
        setPulse(t.id);
        router.refresh(); // pull order summaries for the changed table
      },
    },
    () => router.refresh(),
  );

  const area = areas.find((a) => a.id === areaId);
  const inArea = tables.filter((t) => t.floorAreaId === areaId);
  const selected = tables.find((t) => t.id === selectedId) ?? null;
  const counts = (Object.keys(STATUS) as Status[]).map((s) => [s, tables.filter((t) => t.status === s).length] as const);

  const call = async (url: string, method: string, body: unknown) => {
    setError(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Request failed");
    return json;
  };

  // ── Drag & drop (pointer events: mouse, touch and pen) ─────────────────────
  const onPointerDown = (e: RPointerEvent, t: FloorTable) => {
    if (!editing || !canvasRef.current || !area) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = area.width / rect.width;
    drag.current = { id: t.id, dx: (e.clientX - rect.left) * scale - t.posX, dy: (e.clientY - rect.top) * scale - t.posY, scale, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !canvasRef.current || !area) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const snap = (v: number) => Math.round(v / 8) * 8;
    d.moved = true;
    setTables((ts) =>
      ts.map((t) =>
        t.id !== d.id
          ? t
          : {
              ...t,
              posX: Math.min(area.width - t.width, Math.max(0, snap((e.clientX - rect.left) * d.scale - d.dx))),
              posY: Math.min(area.height - t.height, Math.max(0, snap((e.clientY - rect.top) * d.scale - d.dy))),
            },
      ),
    );
  };
  const onPointerUp = async () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const t = tables.find((x) => x.id === d.id);
    if (!t) return;
    try {
      const saved = await call(`${apiBase}/tables/${t.id}`, "PATCH", { posX: t.posX, posY: t.posY, version: t.version });
      setTables((ts) => ts.map((x) => (x.id === t.id ? { ...x, version: saved.version } : x)));
    } catch (err) {
      setError((err as Error).message);
      router.refresh();
    }
  };

  const setStatus = async (status: Status) => {
    if (!selected) return;
    try {
      const saved = await call(`${apiBase}/tables/${selected.id}`, "PATCH", { status });
      setTables((ts) => ts.map((x) => (x.id === selected.id ? { ...x, status, version: saved.version } : x)));
      setSelectedId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const move = async (targetTableId: string) => {
    if (!selected || !picker) return;
    try {
      await call(`${apiBase}/tables/${selected.id}/${picker}`, "POST", { targetTableId });
      setPicker(null);
      setSelectedId(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist">
          {areas.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={a.id === areaId}
              onClick={() => setAreaId(a.id)}
              className={cn("h-12 rounded-lg px-5 font-medium transition-colors", a.id === areaId ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {a.name}
            </button>
          ))}
        </div>
        <ul className="ml-auto hidden items-center gap-4 text-sm md:flex" aria-label="Legend">
          {counts.map(([s, n]) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-full", STATUS[s].dot)} />
              {STATUS[s].label} <span className="font-semibold tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
        {canEdit && (
          <Button variant={editing ? "primary" : "outline"} onClick={() => setEditing((e) => !e)}>
            {editing ? <Check /> : <Move />} {editing ? "Done" : "Edit layout"}
          </Button>
        )}
      </div>

      {error && <p className="mx-3 mt-2 rounded-xl bg-occupied/10 p-3 text-occupied" role="alert">{error}</p>}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {area && (
          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={cn(
              "relative mx-auto w-full max-w-6xl touch-none rounded-2xl border bg-card",
              editing && "bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px]",
            )}
            style={{ aspectRatio: `${area.width} / ${area.height}` }}
          >
            {inArea.map((t) => {
              const s = STATUS[t.status];
              const mins = t.order ? Math.floor((Date.now() - Date.parse(t.order.openedAt)) / 60_000) : null;
              return (
                <button
                  key={t.id}
                  onPointerDown={(e) => onPointerDown(e, t)}
                  onClick={() => !editing && setSelectedId(t.id)}
                  onAnimationEnd={() => setPulse(null)}
                  aria-label={`Table ${t.label}, ${s.label}`}
                  className={cn(
                    "absolute flex min-h-12 min-w-12 flex-col items-center justify-center border-2 font-semibold shadow-sm transition-[box-shadow,transform] duration-200",
                    t.shape === "ROUND" ? "rounded-full" : "rounded-2xl",
                    s.cls,
                    editing ? "cursor-grab active:cursor-grabbing active:scale-105 active:shadow-lg" : "hover:scale-[1.03] active:scale-95",
                    pulse === t.id && "animate-pulse-ring",
                  )}
                  style={{
                    left: `${(t.posX / area.width) * 100}%`,
                    top: `${(t.posY / area.height) * 100}%`,
                    width: `${(t.width / area.width) * 100}%`,
                    height: `${(t.height / area.height) * 100}%`,
                  }}
                >
                  <span className="text-lg leading-none text-foreground sm:text-xl">{t.label}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs">
                    <Users className="size-3" /> {t.order?.guestCount ?? t.seats}
                    {mins !== null && <span className="tabular-nums">· {mins}m</span>}
                  </span>
                  {t.mergedIntoLabel && <span className="text-[10px] text-muted-foreground">↳ {t.mergedIntoLabel}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick-action drawer */}
      <Sheet
        open={!!selected && !picker}
        onOpenChange={(o) => !o && setSelectedId(null)}
        title={selected ? `Table ${selected.label}` : ""}
        description={selected ? `${STATUS[selected.status].label} · ${selected.seats} seats` : undefined}
      >
        {selected && (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {canTakeOrder && (
              <Button size="lg" asChild>
                <Link href={`/${org}/${location}/orders?table=${selected.id}`}>
                  <ClipboardPlus /> {selected.order ? "Add to order" : "Take order"}
                </Link>
              </Button>
            )}
            {selected.order && (
              <div className="rounded-xl border p-4">
                <p className="mb-2 flex items-center gap-2 font-semibold">
                  <Receipt className="size-5" /> Bill #{selected.order.number}
                </p>
                <ul className="space-y-1 text-[15px]">
                  {selected.order.items.map((i, k) => (
                    <li key={k} className="flex justify-between">
                      <span>{i.name}</span>
                      <span className="tabular-nums text-muted-foreground">×{i.quantity}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex justify-between border-t pt-2 text-lg font-bold">
                  Total <span className="tabular-nums">{formatMoney(selected.order.total, currency)}</span>
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" disabled={!selected.order} onClick={() => setPicker("transfer")}>
                <ArrowRightLeft /> Transfer
              </Button>
              <Button variant="outline" size="lg" onClick={() => setPicker("merge")}>
                <Combine /> Merge
              </Button>
            </div>
            <p className="mt-2 text-sm font-medium text-muted-foreground">Set status</p>
            <div className="grid grid-cols-2 gap-2">
              {(["FREE", "RESERVED", "NEEDS_CLEANING"] as Status[]).map((st) => (
                <Button key={st} variant="secondary" disabled={selected.status === st || (!!selected.order && st === "FREE")} onClick={() => setStatus(st)}>
                  <span className={cn("size-3 rounded-full", STATUS[st].dot)} />
                  {st === "FREE" && selected.status === "NEEDS_CLEANING" ? (
                    <>
                      <Sparkles /> Cleaned
                    </>
                  ) : (
                    STATUS[st].label
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      {/* Target picker for merge / transfer */}
      <Sheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker === "merge" ? `Merge ${selected?.label} into…` : `Move ${selected?.label} to…`}
      >
        <div className="grid grid-cols-3 gap-2 overflow-y-auto">
          {tables
            .filter((t) => t.id !== selected?.id && (picker === "merge" ? true : t.status === "FREE" || t.status === "RESERVED"))
            .map((t) => (
              <button key={t.id} onClick={() => move(t.id)} className={cn("h-20 rounded-xl border-2 text-lg font-semibold", STATUS[t.status].cls)}>
                <span className="text-foreground">{t.label}</span>
              </button>
            ))}
        </div>
      </Sheet>
    </div>
  );
}
