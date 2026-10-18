import { Banknote, Receipt, TrendingDown, TrendingUp, Users, UtensilsCrossed } from "lucide-react";
import { Breakdown, PeakHours } from "@/components/analytics/charts";
import { LiveRefresh } from "@/components/analytics/live-refresh";
import { RangePicker } from "@/components/analytics/range-picker";
import { Card } from "@/components/ui/card";
import { businessDate } from "@/lib/auth/api";
import { requireModule } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function resolveRange(tz: string, range: string, from?: string, to?: string) {
  const today = businessDate(tz);
  if (range === "custom" && from && to) {
    const a = new Date(`${from}T00:00:00Z`);
    const b = new Date(`${to}T00:00:00Z`);
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }
  const days = range === "week" ? 7 : range === "month" ? 30 : 1;
  return { start: new Date(today.getTime() - (days - 1) * DAY), end: today };
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; location: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { org, location } = await params;
  const sp = await searchParams;
  const ctx = await requireModule(org, location, "analytics");
  const db = tenantDb(ctx.org.id);
  const range = sp.range ?? "today";
  const { start, end } = resolveRange(ctx.location.timezone, range, sp.from, sp.to);
  const span = end.getTime() - start.getTime() + DAY;
  const prev = { start: new Date(start.getTime() - span), end: new Date(start.getTime() - DAY) };

  const [rows, prevRows, top] = await Promise.all([
    db.dailySalesSummary.findMany({ where: { locationId: ctx.location.id, businessDate: { gte: start, lte: end } } }),
    db.dailySalesSummary.findMany({ where: { locationId: ctx.location.id, businessDate: { gte: prev.start, lte: prev.end } } }),
    db.orderItem.groupBy({
      by: ["name"],
      where: { isVoided: false, order: { locationId: ctx.location.id, status: "PAID", businessDate: { gte: start, lte: end } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 6,
    }),
  ]);

  const sum = (rs: typeof rows, k: "grossRevenue" | "orderCount" | "guestCount") => rs.reduce((s, r) => s + r[k], 0);
  const gross = sum(rows, "grossRevenue");
  const orders = sum(rows, "orderCount");
  const guests = sum(rows, "guestCount");
  const pGross = sum(prevRows, "grossRevenue");
  const pOrders = sum(prevRows, "orderCount");
  const avg = orders ? Math.round(gross / orders) : 0;
  const pAvg = pOrders ? Math.round(pGross / pOrders) : 0;

  const byHour = Array.from({ length: 24 }, (_, h) => rows.reduce((s, r) => s + ((r.byHour as number[])[h] ?? 0), 0));
  const merge = <T,>(pick: (r: (typeof rows)[number]) => Record<string, T>, val: (v: T) => number, label: (k: string, v: T) => string) => {
    const acc = new Map<string, { label: string; value: number }>();
    rows.forEach((r) =>
      Object.entries(pick(r)).forEach(([k, v]) => {
        const cur = acc.get(k) ?? { label: label(k, v), value: 0 };
        cur.value += val(v);
        acc.set(k, cur);
      }),
    );
    return [...acc.values()];
  };
  const METHOD: Record<string, string> = { CASH: "Cash", CARD: "Card", MOBILE: "Mobile" };
  const byMethod = merge((r) => r.byPaymentMethod as Record<string, number>, (v) => v, (k) => METHOD[k] ?? k);
  const byCategory = merge(
    (r) => r.byCategory as Record<string, { name: string; revenue: number }>,
    (v) => v.revenue,
    (_, v) => v.name,
  );
  const fmt = (n: number) => formatMoney(n, ctx.org.currency);

  return (
    <div className="h-full overflow-y-auto">
      <LiveRefresh org={org} location={location} />
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">
              {ctx.location.name} · {iso(start)}
              {+start !== +end && ` → ${iso(end)}`}
            </p>
          </div>
          <RangePicker range={range} from={sp.from ?? iso(start)} to={sp.to ?? iso(end)} />
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={Banknote} label="Gross revenue" value={formatMoneyCompact(gross, ctx.org.currency)} title={fmt(gross)} now={gross} before={pGross} />
          <Kpi icon={Receipt} label="Total orders" value={String(orders)} now={orders} before={pOrders} />
          <Kpi icon={UtensilsCrossed} label="Avg. table spend" value={fmt(avg)} now={avg} before={pAvg} />
          <Kpi icon={Users} label="Guests served" value={String(guests)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <PeakHours byHour={byHour} currency={ctx.org.currency} />
          <Card className="p-5">
            <h3 className="mb-4 font-semibold">Top-selling items</h3>
            <ol className="space-y-3">
              {top.length === 0 && <li className="py-6 text-center text-muted-foreground">No sales in this range.</li>}
              {top.map((t, i) => (
                <li key={t.name} className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-muted text-sm font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="block font-semibold">{fmt(t._sum.lineTotal ?? 0)}</span>
                    <span className="text-muted-foreground">{t._sum.quantity} sold</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Breakdown byMethod={byMethod} byCategory={byCategory} currency={ctx.org.currency} />
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  now,
  before,
  title,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  title?: string;
  now?: number;
  before?: number;
}) {
  const delta = before ? Math.round(((now! - before) / before) * 100) : null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm font-medium">{label}</span>
        <Icon className="size-5" />
      </div>
      <p className="mt-2 truncate text-3xl font-bold tracking-tight tabular-nums" title={title ?? value}>{value}</p>
      {delta !== null && (
        <p className={cn("mt-1 flex items-center gap-1 text-sm font-medium", delta >= 0 ? "text-free" : "text-occupied")}>
          {delta >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          {delta >= 0 ? "+" : ""}
          {delta}% <span className="font-normal text-muted-foreground">vs previous period</span>
        </p>
      )}
    </Card>
  );
}
