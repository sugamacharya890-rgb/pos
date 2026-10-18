import { Card } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";

export default async function SettingsPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "settings");
  const rows = [
    ["Timezone", ctx.location.timezone],
    ["Tax rate", `${ctx.location.taxRateBps / 100}%${ctx.location.taxInclusive ? " (inclusive)" : ""}`],
    ["Service charge", `${ctx.location.serviceChargeBps / 100}%`],
    ["Currency", ctx.org.currency],
  ];
  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Settings · {ctx.location.name}</h1>
      <Card className="divide-y">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between p-4 text-[15px]">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
