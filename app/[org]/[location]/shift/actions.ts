"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/rbac";
import { requireModule } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db/tenant";

const toMinor = (v: FormDataEntryValue | null) => Math.round(Number(v ?? 0) * 100);

export async function openShift(org: string, location: string, form: FormData) {
  const ctx = await requireModule(org, location, "shift");
  await withTenantTx(ctx.org.id, async (tx) => {
    const open = await tx.shift.findFirst({ where: { locationId: ctx.location.id, cashierId: ctx.membershipId, status: "OPEN" } });
    if (open) return;
    await tx.shift.create({
      data: { organizationId: ctx.org.id, locationId: ctx.location.id, cashierId: ctx.membershipId, openingFloat: toMinor(form.get("float")) },
    });
  });
  revalidatePath(`/${org}/${location}/shift`);
}

export async function closeShift(org: string, location: string, shiftId: string, form: FormData) {
  const ctx = await requireModule(org, location, "shift");
  if (!can(ctx.role, "shift.close")) throw new Error("Forbidden");
  await withTenantTx(ctx.org.id, async (tx) => {
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, locationId: ctx.location.id, status: "OPEN" },
      include: { payments: { where: { method: "CASH", status: "CAPTURED" } }, cashMovements: true },
    });
    if (!shift) return;
    // Cashiers can only close their own drawer; managers can close any.
    if (shift.cashierId !== ctx.membershipId && !["OWNER", "MANAGER"].includes(ctx.role)) throw new Error("Forbidden");
    const expected =
      shift.openingFloat +
      shift.payments.reduce((s, p) => s + p.amount, 0) +
      shift.cashMovements.reduce((s, m) => s + (m.type === "PAY_IN" ? m.amount : -m.amount), 0);
    const counted = toMinor(form.get("counted"));
    await tx.shift.update({
      where: { id: shift.id },
      data: { status: "CLOSED", closedAt: new Date(), expectedCash: expected, countedCash: counted, variance: counted - expected, notes: String(form.get("notes") ?? "") || null },
    });
  });
  revalidatePath(`/${org}/${location}/shift`);
}
