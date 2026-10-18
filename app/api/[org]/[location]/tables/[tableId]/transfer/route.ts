import { NextResponse } from "next/server";
import { apiTenant, handler, HttpError } from "@/lib/auth/api";
import { transferTable, TableMoveInput } from "@/lib/services/tables";

type P = { params: Promise<{ org: string; location: string; tableId: string }> };

export const POST = handler(async (req: Request, { params }: P) => {
  const ctx = await apiTenant(params, "table.transfer");
  const input = TableMoveInput.safeParse(await req.json().catch(() => null));
  if (!input.success) throw new HttpError(400, "Invalid body");
  await transferTable(ctx, (await params).tableId, input.data.targetTableId);
  return NextResponse.json({ ok: true });
});
