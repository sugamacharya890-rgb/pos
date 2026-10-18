import { Card } from "@/components/ui/card";
import { ROLE_MODULES } from "@/lib/auth/rbac";
import { requireModule } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";

export default async function StaffPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "staff");
  const members = await tenantDb(ctx.org.id).membership.findMany({
    where: { OR: [{ allLocations: true }, { role: "OWNER" }, { locations: { some: { locationId: ctx.location.id } } }] },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ role: "asc" }],
  });
  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Staff · {ctx.location.name}</h1>
      <Card className="overflow-hidden">
        <table className="w-full text-left text-[15px]">
          <thead className="bg-muted text-sm text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 font-medium">Role</th>
              <th className="hidden px-4 font-medium md:table-cell">Can open</th>
              <th className="px-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-3">
                  <p className="font-medium">{m.user.name}</p>
                  <p className="text-sm text-muted-foreground">{m.user.email}</p>
                </td>
                <td className="px-4">
                  <span className="rounded-lg bg-accent px-2 py-1 text-sm font-medium">{m.role}</span>
                </td>
                <td className="hidden px-4 text-sm text-muted-foreground md:table-cell">{ROLE_MODULES[m.role].join(", ")}</td>
                <td className="px-4 text-sm">{m.isActive ? "Active" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
