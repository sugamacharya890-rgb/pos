import { NextResponse } from "next/server";
import { apiTenant, handler, HttpError } from "@/lib/auth/api";
import { setTicketStatus, TicketStatusInput } from "@/lib/services/orders";

type P = { params: Promise<{ org: string; location: string; ticketId: string }> };

export const PATCH = handler(async (req: Request, { params }: P) => {
  const input = TicketStatusInput.safeParse(await req.json().catch(() => null));
  if (!input.success) throw new HttpError(400, "Invalid status");
  // Kitchen bumps to READY; waiters may mark SERVED when they pick up.
  const ctx = await apiTenant(params, input.data.status === "SERVED" ? "ticket.serve" : "ticket.bump");
  const { ticketId } = await params;
  await setTicketStatus(ctx, ticketId, input.data.status);
  return NextResponse.json({ ok: true });
});
