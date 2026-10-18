import { FloorPlan } from "@/components/floor/floor-plan";
import { can } from "@/lib/auth/rbac";
import { requireModule } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";

export default async function FloorPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "floor");
  const db = tenantDb(ctx.org.id);

  const [areas, tables] = await Promise.all([
    db.floorArea.findMany({ where: { locationId: ctx.location.id }, orderBy: { sortOrder: "asc" } }),
    db.diningTable.findMany({
      where: { locationId: ctx.location.id },
      orderBy: { label: "asc" },
      include: {
        mergedInto: { select: { label: true } },
        orderTables: {
          where: { order: { status: { in: ["OPEN", "BILLED"] } } },
          include: { order: { include: { items: { where: { isVoided: false }, select: { name: true, quantity: true } } } } },
        },
      },
    }),
  ]);

  return (
    <FloorPlan
      org={org}
      location={location}
      apiBase={`/api/${org}/${location}`}
      currency={ctx.org.currency}
      canEdit={can(ctx.role, "floor.edit")}
      canTakeOrder={can(ctx.role, "order.create")}
      areas={areas.map((a) => ({ id: a.id, name: a.name, width: a.width, height: a.height }))}
      initialTables={tables.map((t) => {
        const o = t.orderTables[0]?.order;
        return {
          id: t.id,
          floorAreaId: t.floorAreaId,
          label: t.label,
          seats: t.seats,
          shape: t.shape,
          posX: t.posX,
          posY: t.posY,
          width: t.width,
          height: t.height,
          status: t.status,
          version: t.version,
          mergedIntoLabel: t.mergedInto?.label ?? null,
          order: o
            ? { number: o.number, total: o.total, guestCount: o.guestCount, openedAt: o.openedAt.toISOString(), items: o.items }
            : null,
        };
      })}
    />
  );
}
