import { ArrowRight, LogOut, Store } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { businessDate } from "@/lib/auth/api";
import { ROLE_HOME } from "@/lib/auth/rbac";
import { getClaims } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney } from "@/lib/money";

/**
 * Franchise owner's portfolio: every outlet they own, today's numbers side by
 * side. Scoped by RLS to this one organization — another owner's outlets are
 * physically unreachable from here.
 */
export default async function OrgHome({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const claims = await getClaims();
  if (!claims) redirect("/login");
  const m = claims.m.find((x) => x.s === org);
  if (!m) notFound();

  const db = tenantDb(m.o);
  const [organization, locations] = await Promise.all([
    db.organization.findUnique({ where: { id: m.o } }),
    db.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!organization) notFound();
  const visible = m.l === "*" ? locations : locations.filter((l) => (m.l as string[]).includes(l.slug));
  if (visible.length === 1 && m.r !== "OWNER") redirect(`/${org}/${visible[0].slug}/${ROLE_HOME[m.r]}`);

  const summaries = await db.dailySalesSummary.findMany({
    where: { OR: visible.map((l) => ({ locationId: l.id, businessDate: businessDate(l.timezone) })) },
  });
  const byLoc = new Map(summaries.map((s) => [s.locationId, s]));
  const [openOrders, occupied] = await Promise.all([
    db.order.groupBy({ by: ["locationId"], where: { status: { in: ["OPEN", "BILLED"] } }, _count: true }),
    db.diningTable.groupBy({ by: ["locationId"], where: { status: "OCCUPIED" }, _count: true }),
  ]);
  const openBy = new Map(openOrders.map((o) => [o.locationId, o._count]));
  const occBy = new Map(occupied.map((o) => [o.locationId, o._count]));
  const totalToday = visible.reduce((s, l) => s + (byLoc.get(l.id)?.grossRevenue ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground">{m.r === "OWNER" ? "Franchise owner" : "Choose a location"}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{organization.name}</h1>
        </div>
        {m.r === "OWNER" && (
          <div className="ml-auto text-right">
            <p className="text-sm text-muted-foreground">All outlets · today</p>
            <p className="text-3xl font-bold tabular-nums">{formatMoney(totalToday, organization.currency)}</p>
          </div>
        )}
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((l) => {
          const s = byLoc.get(l.id);
          return (
            <Link key={l.id} href={`/${org}/${l.slug}/${ROLE_HOME[m.r]}`} className="group">
              <Card className="flex h-full flex-col gap-4 p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-xl bg-accent">
                    <Store className="size-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">{l.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{l.address ?? l.timezone}</p>
                  </div>
                  <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <dl className="grid grid-cols-3 gap-2 border-t pt-4 text-center">
                  <Stat label="Today" value={formatMoney(s?.grossRevenue ?? 0, organization.currency)} />
                  <Stat label="Open orders" value={String(openBy.get(l.id) ?? 0)} />
                  <Stat label="Tables busy" value={String(occBy.get(l.id) ?? 0)} />
                </dl>
              </Card>
            </Link>
          );
        })}
      </div>
      <form action="/api/auth/logout" method="post" className="mt-8">
        <Button variant="ghost" type="submit">
          <LogOut /> Sign out
        </Button>
      </form>
    </main>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="font-semibold tabular-nums">{value}</dd>
  </div>
);
