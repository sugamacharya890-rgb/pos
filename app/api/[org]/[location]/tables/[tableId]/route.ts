import { NextResponse } from "next/server";
import { apiTenant, handler, HttpError } from "@/lib/auth/api";
import { PatchTableInput, patchTable } from "@/lib/services/tables";

type P = { params: Promise<{ org: string; location: string; tableId: string }> };

/** Status change or drag-and-drop reposition (role re-checked per field). */
export const PATCH = handler(async (req: Request, { params }: P) => {
  const ctx = await apiTenant(params, "table.status");
  const input = PatchTableInput.safeParse(await req.json().catch(() => null));
  if (!input.success) throw new HttpError(400, "Invalid body");
  const t = await patchTable(ctx, (await params).tableId, input.data);
  return NextResponse.json({ id: t.id, status: t.status, posX: t.posX, posY: t.posY, version: t.version });
});
