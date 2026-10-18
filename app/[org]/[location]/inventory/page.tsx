import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";

export default async function InventoryPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "inventory");
  const levels = await tenantDb(ctx.org.id).stockLevel.findMany({
    where: { locationId: ctx.location.id },
    include: { item: true },
    orderBy: { item: { name: "asc" } },
  });
  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Inventory · {ctx.location.name}</h1>
      <Card className="overflow-hidden">
        <table className="w-full text-left text-[15px]">
          <thead className="bg-muted text-sm text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 font-medium">On hand</th>
              <th className="px-4 font-medium">Reorder at</th>
              <th className="px-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => {
              const low = Number(l.onHand) <= Number(l.reorderLevel);
              return (
                <tr key={l.inventoryItemId} className="border-t">
                  <td className="px-4 py-3 font-medium">{l.item.name}</td>
                  <td className="px-4 tabular-nums">
                    {Number(l.onHand).toLocaleString()} {l.item.unit}
                  </td>
                  <td className="px-4 tabular-nums text-muted-foreground">
                    {Number(l.reorderLevel).toLocaleString()} {l.item.unit}
                  </td>
                  <td className="px-4">
                    {low ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-occupied/10 px-2 py-1 text-sm font-medium text-occupied">
                        <AlertTriangle className="size-4" /> Reorder
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
