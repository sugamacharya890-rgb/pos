"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "custom", label: "Custom" },
] as const;

export function RangePicker({ range, from, to }: { range: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => p.set(k, v));
    router.push(`${pathname}?${p}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={range === r.id}
            onClick={() => go(r.id === "custom" ? { range: r.id, from, to } : { range: r.id })}
            className={cn("h-12 rounded-lg px-4 font-medium", range === r.id ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {r.label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" aria-label="From" defaultValue={from} onChange={(e) => go({ from: e.target.value })} className="h-12 rounded-xl border bg-card px-3" />
          <span className="text-muted-foreground">→</span>
          <input type="date" aria-label="To" defaultValue={to} onChange={(e) => go({ to: e.target.value })} className="h-12 rounded-xl border bg-card px-3" />
        </div>
      )}
    </div>
  );
}
