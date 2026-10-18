import { NextResponse } from "next/server";
import { apiTenant, handler, HttpError } from "@/lib/auth/api";
import { CreateOrderInput, createOrFireOrder } from "@/lib/services/orders";

type P = { params: Promise<{ org: string; location: string }> };

/** Create an order or fire more items to a table's open order. */
export const POST = handler(async (req: Request, { params }: P) => {
  const ctx = await apiTenant(params, "order.create");
  const input = CreateOrderInput.safeParse(await req.json().catch(() => null));
  if (!input.success) throw new HttpError(400, input.error.issues[0]?.message ?? "Invalid body");
  const { orderId, replay } = await createOrFireOrder(ctx, input.data);
  return NextResponse.json({ orderId }, { status: replay ? 200 : 201 });
});
