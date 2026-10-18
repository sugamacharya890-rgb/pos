import "server-only";
import type { TableStatus } from "@prisma/client";
import { z } from "zod";
import { HttpError, type TenantContext } from "@/lib/auth/api";
import { can } from "@/lib/auth/rbac";
import { withTenantTx } from "@/lib/db/tenant";
import { computeTotals } from "@/lib/pricing";
import { emit } from "@/lib/realtime/emit";

export const PatchTableInput = z.object({
  status: z.enum(["FREE", "OCCUPIED", "RESERVED", "NEEDS_CLEANING"]).optional(),
  posX: z.number().int().min(0).max(10_000).optional(),
  posY: z.number().int().min(0).max(10_000).optional(),
  /** optimistic lock: two managers dragging the same table */
  version: z.number().int().optional(),
});

export const TableMoveInput = z.object({ targetTableId: z.string() });

const OPEN = { status: { in: ["OPEN", "BILLED"] as ("OPEN" | "BILLED")[] } };
const floor = (ctx: TenantContext) => ({ orgId: ctx.org.id, locationSlug: ctx.location.slug, channel: "floor" as const });

export async function patchTable(ctx: TenantContext, id: string, input: z.infer<typeof PatchTableInput>) {
  const moving = input.posX !== undefined || input.posY !== undefined;
  if (moving && !can(ctx.role, "floor.edit")) throw new HttpError(403, "Forbidden");
  if (input.status && !can(ctx.role, "table.status")) throw new HttpError(403, "Forbidden");

  const t = await withTenantTx(ctx.org.id, async (tx) => {
    const res = await tx.diningTable.updateMany({
      where: { id, locationId: ctx.location.id, ...(input.version !== undefined && { version: input.version }) },
      data: {
        posX: input.posX,
        posY: input.posY,
        ...(input.status && { status: input.status, statusChangedAt: new Date() }),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) throw new HttpError(409, "Table changed on another device — refresh");
    return tx.diningTable.findUniqueOrThrow({ where: { id } });
  });
  emit(floor(ctx), "table.updated", { id, status: t.status, posX: t.posX, posY: t.posY });
  return t;
}

/** Merge `sourceId` into `targetTableId`: one shared bill across both tables. */
export async function mergeTables(ctx: TenantContext, sourceId: string, targetTableId: string) {
  if (sourceId === targetTableId) throw new HttpError(400, "Pick another table");
  await withTenantTx(ctx.org.id, async (tx) => {
    const [src, dst] = await Promise.all(
      [sourceId, targetTableId].map((id) =>
        tx.diningTable.findFirst({
          where: { id, locationId: ctx.location.id },
          include: { orderTables: { where: { order: OPEN }, select: { orderId: true } } },
        }),
      ),
    );
    if (!src || !dst) throw new HttpError(404, "Table not found");
    const srcOrder = src.orderTables[0]?.orderId;
    const dstOrder = dst.orderTables[0]?.orderId;
    const keep = dstOrder ?? srcOrder;
    if (!keep) throw new HttpError(400, "Neither table has an open order");

    if (srcOrder && dstOrder && srcOrder !== dstOrder) {
      await tx.orderItem.updateMany({ where: { orderId: srcOrder }, data: { orderId: dstOrder } });
      await tx.kdsTicket.updateMany({ where: { orderId: srcOrder }, data: { orderId: dstOrder } });
      await tx.orderTable.deleteMany({ where: { orderId: srcOrder } });
      await tx.order.update({ where: { id: srcOrder }, data: { status: "VOID", note: `Merged into ${dst.label}`, closedAt: new Date() } });
      // Totals for `keep` are recomputed on next fire/payment; recompute now for the bill view.
      const items = await tx.orderItem.findMany({ where: { orderId: dstOrder, isVoided: false } });
      await tx.order.update({ where: { id: dstOrder }, data: { ...computeTotals(items, ctx.location), version: { increment: 1 } } });
    }
    for (const t of [src, dst]) {
      await tx.orderTable.upsert({
        where: { orderId_tableId: { orderId: keep, tableId: t.id } },
        create: { orderId: keep, tableId: t.id, isPrimary: t.id === targetTableId },
        update: { isPrimary: t.id === targetTableId },
      });
    }
    await tx.diningTable.update({ where: { id: sourceId }, data: { mergedIntoId: targetTableId, status: "OCCUPIED", version: { increment: 1 } } });
    await tx.diningTable.update({ where: { id: targetTableId }, data: { status: "OCCUPIED", version: { increment: 1 } } });
  });
  [sourceId, targetTableId].forEach((id) => emit(floor(ctx), "table.updated", { id, status: "OCCUPIED" }));
}

/** Move a party (and its open order) to a free table. */
export async function transferTable(ctx: TenantContext, sourceId: string, targetTableId: string) {
  await withTenantTx(ctx.org.id, async (tx) => {
    const dst = await tx.diningTable.findFirst({ where: { id: targetTableId, locationId: ctx.location.id } });
    if (!dst) throw new HttpError(404, "Table not found");
    if (dst.status !== "FREE" && dst.status !== "RESERVED") throw new HttpError(409, `${dst.label} is not free`);
    const link = await tx.orderTable.findFirst({ where: { tableId: sourceId, order: OPEN } });
    if (!link) throw new HttpError(400, "No open order on this table");
    await tx.orderTable.delete({ where: { orderId_tableId: { orderId: link.orderId, tableId: sourceId } } });
    await tx.orderTable.create({ data: { orderId: link.orderId, tableId: targetTableId, isPrimary: link.isPrimary } });
    await tx.diningTable.update({ where: { id: sourceId }, data: { status: "NEEDS_CLEANING" as TableStatus, mergedIntoId: null, version: { increment: 1 } } });
    await tx.diningTable.update({ where: { id: targetTableId }, data: { status: "OCCUPIED", version: { increment: 1 } } });
  });
  emit(floor(ctx), "table.updated", { id: sourceId, status: "NEEDS_CLEANING" });
  emit(floor(ctx), "table.updated", { id: targetTableId, status: "OCCUPIED" });
}
