import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PosScreen } from "@/components/pos/pos-screen";
import { Card } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney } from "@/lib/money";
import { loadActiveOrders, loadMenu } from "@/lib/queries";

/** Waiter order pad. With ?table= it is the order-taking screen; without, a list of open tables. */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; location: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const { org, location } = await params;
  const { table: tableId } = await searchParams;
  const ctx = await requireModule(org, location, "orders");

  if (tableId) {
    const table = await tenantDb(ctx.org.id).diningTable.findFirst({ where: { id: tableId, locationId: ctx.location.id } });
    if (!table) notFound();
    const menu = await loadMenu(ctx);
    return (
      <PosScreen
        mode="order"
        apiBase={`/api/${org}/${location}`}
        currency={ctx.org.currency}
        rules={ctx.location}
        table={{ id: table.id, label: table.label, seats: table.seats }}
        doneHref={`/${org}/${location}/floor`}
        {...menu}
      />
    );
  }

  const orders = await loadActiveOrders(ctx);
  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="mb-4 text-2xl font-semibold">Open orders</h1>
      {orders.length === 0 && (
        <Card className="grid place-items-center gap-2 p-12 text-center text-muted-foreground">
          <ClipboardList className="size-10 opacity-40" />
          No open orders. Pick a table on the <Link className="text-primary underline" href={`/${org}/${location}/floor`}>floor plan</Link> to start one.
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-lg font-semibold">{o.tableLabel ?? "Takeaway"}</p>
              <p className="text-sm text-muted-foreground">#{o.number}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{o.items.reduce((s, i) => s + i.quantity, 0)} items</p>
            <p className="mt-3 text-xl font-bold tabular-nums">{formatMoney(o.total, ctx.org.currency)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
