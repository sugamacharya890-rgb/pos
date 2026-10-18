"use client";

import { AlarmClock, CheckCheck, Clock3, Flame, Timer, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useChannel } from "@/lib/realtime/client";
import type { TicketDTO } from "@/lib/realtime/events";
import { cn } from "@/lib/utils";

type Status = TicketDTO["status"];
const COLUMNS: { status: Status; label: string; next?: Status; action?: string }[] = [
  { status: "NEW", label: "New", next: "IN_PREPARATION", action: "Start" },
  { status: "IN_PREPARATION", label: "In preparation", next: "READY", action: "Ready" },
  { status: "READY", label: "Ready", next: "SERVED", action: "Served" },
  { status: "SERVED", label: "Served" },
];
const PREV: Partial<Record<Status, Status>> = { IN_PREPARATION: "NEW", READY: "IN_PREPARATION", SERVED: "READY" };

/** Green < 10 min · Yellow 10–20 · Red > 20 — always with icon + text, never colour alone. */
function urgency(mins: number) {
  if (mins >= 20) return { cls: "border-timer-late bg-timer-late/10 text-timer-late", icon: AlarmClock, label: "Late" };
  if (mins >= 10) return { cls: "border-timer-warn bg-timer-warn/15 text-[color-mix(in_oklch,var(--timer-warn)_60%,var(--foreground))]", icon: Timer, label: "Due" };
  return { cls: "border-timer-ok bg-timer-ok/10 text-timer-ok", icon: Clock3, label: "On time" };
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function chime() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {}
}

export function KdsBoard({
  org,
  location,
  apiBase,
  initialTickets,
  pinnedStation,
}: {
  org: string;
  location: string;
  apiBase: string;
  initialTickets: TicketDTO[];
  pinnedStation: "KITCHEN" | "BAR" | null;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [station, setStation] = useState<"KITCHEN" | "BAR" | "ALL">(pinnedStation ?? "ALL");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const now = useNow(15_000);
  const router = useRouter();

  useEffect(() => setTickets(initialTickets), [initialTickets]);

  useChannel(
    { org, location, channel: "kds" },
    {
      "ticket.created": (t) => {
        setTickets((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, t]));
        setFresh((f) => new Set(f).add(t.id));
        setTimeout(() => setFresh((f) => (f.delete(t.id), new Set(f))), 4000);
        if (station === "ALL" || t.station === station) chime();
      },
      "ticket.updated": ({ id, status }) => setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t))),
    },
    () => router.refresh(), // resync anything missed while offline
  );

  const move = useCallback(
    async (id: string, status: Status) => {
      const prev = tickets.find((t) => t.id === id)?.status;
      setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
      const res = await fetch(`${apiBase}/tickets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok && prev) setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status: prev } : t)));
    },
    [apiBase, tickets],
  );

  const shown = useMemo(
    () =>
      tickets
        .filter((t) => station === "ALL" || t.station === station)
        .sort((a, b) => a.firedAt.localeCompare(b.firedAt)),
    [tickets, station],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <h1 className="mr-auto text-xl font-semibold">Kitchen display</h1>
        {!pinnedStation &&
          (["ALL", "KITCHEN", "BAR"] as const).map((s) => (
            <Button key={s} variant={station === s ? "primary" : "secondary"} onClick={() => setStation(s)}>
              {s === "ALL" ? "All stations" : s === "KITCHEN" ? "Kitchen" : "Bar"}
            </Button>
          ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-x-auto p-3 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = shown.filter((t) => t.status === col.status).slice(col.status === "SERVED" ? -8 : 0);
          return (
            <section key={col.status} className="flex min-h-0 flex-col rounded-2xl bg-muted/60 p-2" aria-label={col.label}>
              <h2 className="flex items-center justify-between px-2 py-2 font-semibold">
                {col.label}
                <span className="grid min-w-8 place-items-center rounded-full bg-card px-2 text-sm tabular-nums">{list.length}</span>
              </h2>
              <ol className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {list.map((t) => {
                  const mins = Math.max(0, Math.floor((now - Date.parse(t.firedAt)) / 60_000));
                  const u = urgency(mins);
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        "rounded-xl border-l-4 bg-card p-3 shadow-sm transition-all",
                        col.status === "SERVED" ? "border-l-border opacity-60" : u.cls.split(" ")[0],
                        fresh.has(t.id) && "animate-arrive animate-pulse-ring",
                      )}
                    >
                      <header className="mb-2 flex items-center justify-between gap-2">
                        <div className="leading-tight">
                          <p className="text-xl font-bold">{t.tableLabel ?? "Takeaway"}</p>
                          <p className="text-sm text-muted-foreground">
                            #{t.orderNumber} · {t.station === "BAR" ? "Bar" : "Kitchen"}
                          </p>
                        </div>
                        {col.status !== "SERVED" && (
                          <span className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold tabular-nums", u.cls)}>
                            <u.icon className="size-4" aria-hidden /> {mins}m <span className="sr-only">{u.label}</span>
                          </span>
                        )}
                      </header>
                      <ul className="space-y-1.5">
                        {t.items.map((i) => (
                          <li key={i.id} className="text-[17px]">
                            <span className="font-bold tabular-nums">{i.quantity}×</span> {i.name}
                            {i.seatNumber && <span className="text-sm text-muted-foreground"> · S{i.seatNumber}</span>}
                            {i.modifiers.length > 0 && (
                              <p className="pl-6 text-sm font-medium text-occupied">{i.modifiers.join(" · ")}</p>
                            )}
                            {i.notes && <p className="pl-6 text-sm italic text-muted-foreground">“{i.notes}”</p>}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex gap-2">
                        {PREV[t.status] && (
                          <Button variant="ghost" size="icon" aria-label="Undo" onClick={() => move(t.id, PREV[t.status]!)}>
                            <Undo2 />
                          </Button>
                        )}
                        {col.next && (
                          <Button className="flex-1" size="lg" variant={col.status === "READY" ? "secondary" : "primary"} onClick={() => move(t.id, col.next!)}>
                            {col.status === "NEW" ? <Flame /> : <CheckCheck />} {col.action}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
