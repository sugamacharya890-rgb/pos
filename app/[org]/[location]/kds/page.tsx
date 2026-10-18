import { KdsBoard } from "@/components/kds/kds-board";
import { roleStation } from "@/lib/auth/rbac";
import { requireModule } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";
import { toTicketDTO } from "@/lib/services/orders";

export default async function KdsPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "kds");
  const station = roleStation(ctx.role);
  const since = new Date(Date.now() - 15 * 60_000);

  const tickets = await tenantDb(ctx.org.id).kdsTicket.findMany({
    where: {
      locationId: ctx.location.id,
      ...(station && { station }),
      OR: [{ status: { not: "SERVED" } }, { servedAt: { gte: since } }],
    },
    orderBy: { firedAt: "asc" },
    include: {
      items: { include: { modifiers: true } },
      order: { select: { number: true, tables: { where: { isPrimary: true }, select: { table: { select: { label: true } } } } } },
    },
  });

  return (
    <KdsBoard
      org={org}
      location={location}
      apiBase={`/api/${org}/${location}`}
      initialTickets={tickets.map(toTicketDTO)}
      pinnedStation={station}
    />
  );
}
