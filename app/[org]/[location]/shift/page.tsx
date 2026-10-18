import { Banknote, CreditCard, Lock, Smartphone, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { closeShift, openShift } from "./actions";

export default async function ShiftPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "shift");
  const db = tenantDb(ctx.org.id);
  const fmt = (n: number) => formatMoney(n, ctx.org.currency);

  const shift = await db.shift.findFirst({
    where: { locationId: ctx.location.id, cashierId: ctx.membershipId, status: "OPEN" },
    include: { payments: { where: { status: "CAPTURED" } }, cashMovements: true },
  });
  const lastClosed = await db.shift.findMany({
    where: { locationId: ctx.location.id, status: "CLOSED", ...(ctx.role === "CASHIER" && { cashierId: ctx.membershipId }) },
    orderBy: { closedAt: "desc" },
    take: 5,
    include: { cashier: { include: { user: { select: { name: true } } } } },
  });

  const by = (m: string) => shift?.payments.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0) ?? 0;
  const movements = shift?.cashMovements.reduce((s, m) => s + (m.type === "PAY_IN" ? m.amount : -m.amount), 0) ?? 0;
  const expected = (shift?.openingFloat ?? 0) + by("CASH") + movements;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 lg:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">End-of-shift cash summary</h1>

        {!shift ? (
          <Card className="p-6">
            <form action={openShift.bind(null, org, location)} className="flex flex-wrap items-end gap-3">
              <label className="flex-1">
                <span className="mb-1 block text-sm font-medium">Opening float</span>
                <input name="float" type="number" step="0.01" min="0" defaultValue="100" className="h-14 w-full rounded-xl border bg-background px-4 text-lg" />
              </label>
              <Button size="lg" type="submit">
                <Unlock /> Open shift
              </Button>
            </form>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Tile icon={Banknote} label="Cash sales" value={fmt(by("CASH"))} />
              <Tile icon={CreditCard} label="Card" value={fmt(by("CARD"))} />
              <Tile icon={Smartphone} label="Mobile" value={fmt(by("MOBILE"))} />
            </div>
            <Card className="p-6">
              <dl className="space-y-2 text-[15px]">
                <Line label="Opening float" value={fmt(shift.openingFloat)} />
                <Line label="Cash sales" value={fmt(by("CASH"))} />
                <Line label="Pay-ins / pay-outs" value={fmt(movements)} />
                <div className="flex justify-between border-t pt-3 text-xl font-bold">
                  <dt>Expected in drawer</dt>
                  <dd className="tabular-nums">{fmt(expected)}</dd>
                </div>
              </dl>
              <form action={closeShift.bind(null, org, location, shift.id)} className="mt-6 flex flex-wrap items-end gap-3">
                <label className="flex-1">
                  <span className="mb-1 block text-sm font-medium">Counted cash</span>
                  <input name="counted" type="number" step="0.01" min="0" required className="h-14 w-full rounded-xl border bg-background px-4 text-lg" />
                </label>
                <label className="flex-1">
                  <span className="mb-1 block text-sm font-medium">Notes</span>
                  <input name="notes" className="h-14 w-full rounded-xl border bg-background px-4 text-lg" />
                </label>
                <Button size="lg" type="submit" variant="danger">
                  <Lock /> Close shift
                </Button>
              </form>
            </Card>
          </>
        )}

        {lastClosed.length > 0 && (
          <Card className="p-6">
            <h2 className="mb-3 font-semibold">Recent closed shifts</h2>
            <table className="w-full text-left text-[15px]">
              <thead className="text-sm text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Cashier</th>
                  <th className="font-medium">Closed</th>
                  <th className="text-right font-medium">Expected</th>
                  <th className="text-right font-medium">Counted</th>
                  <th className="text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {lastClosed.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="py-3">{s.cashier.user.name}</td>
                    <td>{s.closedAt?.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{fmt(s.expectedCash ?? 0)}</td>
                    <td className="text-right tabular-nums">{fmt(s.countedCash ?? 0)}</td>
                    <td className={cn("text-right font-semibold tabular-nums", (s.variance ?? 0) < 0 ? "text-occupied" : "text-free")}>
                      {fmt(s.variance ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

const Tile = ({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) => (
  <Card className="p-5">
    <div className="flex items-center justify-between text-muted-foreground">
      <span className="text-sm font-medium">{label}</span>
      <Icon className="size-5" />
    </div>
    <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
  </Card>
);
const Line = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-muted-foreground">
    <dt>{label}</dt>
    <dd className="tabular-nums text-foreground">{value}</dd>
  </div>
);
