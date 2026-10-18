import { NextResponse } from "next/server";
import { apiTenant, handler, HttpError } from "@/lib/auth/api";
import { CapturePaymentInput, capturePayment } from "@/lib/services/orders";

type P = { params: Promise<{ org: string; location: string; orderId: string }> };

export const POST = handler(async (req: Request, { params }: P) => {
  const ctx = await apiTenant(params, "payment.capture");
  const { orderId } = await params;
  const input = CapturePaymentInput.safeParse(await req.json().catch(() => null));
  if (!input.success) throw new HttpError(400, input.error.issues[0]?.message ?? "Invalid body");
  const result = await capturePayment(ctx, orderId, input.data);
  return NextResponse.json(result, { status: result.replay ? 200 : 201 });
});
