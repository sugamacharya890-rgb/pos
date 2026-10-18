import { PosScreen } from "@/components/pos/pos-screen";
import { requireModule } from "@/lib/auth/session";
import { loadActiveOrders, loadMenu } from "@/lib/queries";

export default async function PosPage({ params }: { params: Promise<{ org: string; location: string }> }) {
  const { org, location } = await params;
  const ctx = await requireModule(org, location, "pos");
  const [menu, activeOrders] = await Promise.all([loadMenu(ctx), loadActiveOrders(ctx)]);
  return (
    <PosScreen
      mode="checkout"
      apiBase={`/api/${org}/${location}`}
      currency={ctx.org.currency}
      rules={ctx.location}
      activeOrders={activeOrders}
      {...menu}
    />
  );
}
