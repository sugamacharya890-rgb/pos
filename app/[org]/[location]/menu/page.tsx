import { Card } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { loadMenu } from "@/lib/queries";

export default async function MenuPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "menu");
  const { categories, items } = await loadMenu(ctx);
  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Menu</h1>
      <p className="mb-4 text-muted-foreground">Shared by every {ctx.org.name} outlet · prices shown for {ctx.location.name}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {categories.map((c) => (
          <Card key={c.id} className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <span className="size-3 rounded-full" style={{ background: c.color ?? "var(--border)" }} /> {c.name}
            </h2>
            <ul className="divide-y">
              {items
                .filter((i) => i.categoryId === c.id)
                .map((i) => (
                  <li key={i.id} className="flex justify-between py-2">
                    <span>
                      {i.name} <span className="text-sm text-muted-foreground">{i.shortcode}</span>
                    </span>
                    <span className="tabular-nums">{formatMoney(i.price, ctx.org.currency)}</span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
