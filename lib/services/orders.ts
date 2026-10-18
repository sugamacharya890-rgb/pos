import "server-only";
import { Prisma, type Station } from "@prisma/client";
import { z } from "zod";
import { businessDate, HttpError, localHour, type TenantContext } from "@/lib/auth/api";
import { withTenantTx } from "@/lib/db/tenant";
import { allocate, computeTotals } from "@/lib/pricing";
import { emit } from "@/lib/realtime/emit";
import type { TicketDTO } from "@/lib/realtime/events";

// ─────────────────────────────── Schemas ─────────────────────────────────────

export const CreateOrderInput = z.object({
  idempotencyKey: z.uuid(),
  type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).default("DINE_IN"),
  tableId: z.string().optional(),
  guestCount: z.number().int().min(1).max(100).default(1),
  note: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        menuItemId: z.string(),
        quantity: z.number().int().min(1).max(99),
        modifierIds: z.array(z.string()).max(20).default([]),
        seatNumber: z.number().int().min(1).max(50).optional(),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const CapturePaymentInput = z.object({
  idempotencyKey: z.uuid(),
  split: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("FULL") }),
    z.object({ mode: z.literal("EQUAL"), ways: z.number().int().min(2).max(50) }),
    z.object({ mode: z.literal("BY_SEAT") }),
  ]),
  /** one tender per bill, in bill order */
  tenders: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "MOBILE"]),
        tendered: z.number().int().min(0).optional(),
        tip: z.number().int().min(0).default(0),
        reference: z.string().max(120).optional(),
      }),
    )
    .min(1),
});

export const TicketStatusInput = z.object({
  status: z.enum(["NEW", "IN_PREPARATION", "READY", "SERVED"]),
});

const ticketInclude = {
  items: { include: { modifiers: true } },
  order: { select: { number: true, tables: { where: { isPrimary: true }, select: { table: { select: { label: true } } } } } },
} satisfies Prisma.KdsTicketInclude;

type TicketRow = Prisma.KdsTicketGetPayload<{ include: typeof ticketInclude }>;

export const toTicketDTO = (t: TicketRow): TicketDTO => ({
  id: t.id,
  orderId: t.orderId,
  orderNumber: t.order.number,
  tableLabel: t.order.tables[0]?.table.label ?? null,
  station: t.station,
  status: t.status,
  firedAt: t.firedAt.toISOString(),
  items: t.items.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    notes: i.notes,
    seatNumber: i.seatNumber,
    modifiers: i.modifiers.map((m) => m.name),
  })),
});

// ───────────────────────────── Create / fire ─────────────────────────────────

/**
 * Create an order (or append to the table's open order) and fire new items to
 * the KDS. Prices are ALWAYS re-read from the DB — the client's numbers are
 * display-only. Cross-tenant ids are invisible under RLS, so they fail as
 * "unknown item" rather than leaking another owner's menu.
 */
export async function createOrFireOrder(ctx: TenantContext, input: z.infer<typeof CreateOrderInput>) {
  const result = await withTenantTx(ctx.org.id, async (tx) => {
    const existing = await tx.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { orderId: existing.id, tickets: [] as TicketRow[], tableId: null, replay: true };

    const itemIds = [...new Set(input.lines.map((l) => l.menuItemId))];
    const [items, overrides, modifiers] = await Promise.all([
      tx.menuItem.findMany({ where: { id: { in: itemIds }, isArchived: false, isAvailable: true } }),
      tx.locationMenuItem.findMany({ where: { locationId: ctx.location.id, menuItemId: { in: itemIds } } }),
      tx.modifier.findMany({
        where: { id: { in: input.lines.flatMap((l) => l.modifierIds) } },
        include: { group: { select: { menuItems: { select: { menuItemId: true } } } } },
      }),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const overrideById = new Map(overrides.map((o) => [o.menuItemId, o]));
    const modById = new Map(modifiers.map((m) => [m.id, m]));

    // Resolve table + existing open order.
    let orderId: string | null = null;
    if (input.tableId) {
      const table = await tx.diningTable.findFirst({
        where: { id: input.tableId, locationId: ctx.location.id },
        include: { orderTables: { where: { order: { status: { in: ["OPEN", "BILLED"] } } }, select: { orderId: true } } },
      });
      if (!table) throw new HttpError(400, "Unknown table");
      orderId = table.orderTables[0]?.orderId ?? null;
    }

    if (!orderId) {
      const date = businessDate(ctx.location.timezone);
      const counter = await tx.orderCounter.upsert({
        where: { locationId_businessDate: { locationId: ctx.location.id, businessDate: date } },
        create: { organizationId: ctx.org.id, locationId: ctx.location.id, businessDate: date, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const order = await tx.order.create({
        data: {
          organizationId: ctx.org.id,
          locationId: ctx.location.id,
          number: counter.lastNumber,
          businessDate: date,
          type: input.type,
          guestCount: input.guestCount,
          note: input.note,
          waiterId: ctx.membershipId,
          idempotencyKey: input.idempotencyKey,
          tables: input.tableId ? { create: { tableId: input.tableId } } : undefined,
        },
      });
      orderId = order.id;
      if (input.tableId) {
        await tx.diningTable.update({
          where: { id: input.tableId },
          data: { status: "OCCUPIED", statusChangedAt: new Date(), version: { increment: 1 } },
        });
      }
    }

    // Build line rows.
    const rows = input.lines.map((l) => {
      const item = itemById.get(l.menuItemId);
      const ov = overrideById.get(l.menuItemId);
      if (!item || ov?.isAvailable === false) throw new HttpError(400, `Item unavailable: ${l.menuItemId}`);
      const mods = l.modifierIds.map((id) => {
        const m = modById.get(id);
        if (!m || !m.group.menuItems.some((x) => x.menuItemId === item.id)) {
          throw new HttpError(400, `Invalid modifier for ${item.name}`);
        }
        return m;
      });
      const unitPrice = ov?.priceOverride ?? item.price;
      const modifiersTotal = mods.reduce((s, m) => s + m.priceDelta, 0);
      return { l, item, mods, unitPrice, modifiersTotal, lineTotal: (unitPrice + modifiersTotal) * l.quantity };
    });

    // One KDS ticket per station per fire.
    const stations = [...new Set(rows.map((r) => r.item.station))] as Station[];
    const tickets = new Map<Station, string>();
    for (const station of stations) {
      const t = await tx.kdsTicket.create({
        data: { organizationId: ctx.org.id, locationId: ctx.location.id, orderId, station },
      });
      tickets.set(station, t.id);
    }

    for (const r of rows) {
      await tx.orderItem.create({
        data: {
          organizationId: ctx.org.id,
          orderId,
          menuItemId: r.item.id,
          ticketId: tickets.get(r.item.station),
          name: r.item.name,
          unitPrice: r.unitPrice,
          quantity: r.l.quantity,
          modifiersTotal: r.modifiersTotal,
          lineTotal: r.lineTotal,
          seatNumber: r.l.seatNumber,
          station: r.item.station,
          notes: r.l.notes,
          modifiers: { create: r.mods.map((m) => ({ modifierId: m.id, name: m.name, priceDelta: m.priceDelta })) },
        },
      });
    }

    await recomputeTotals(tx, ctx, orderId);
    const ticketRows = await tx.kdsTicket.findMany({ where: { id: { in: [...tickets.values()] } }, include: ticketInclude });
    return { orderId, tickets: ticketRows, tableId: input.tableId ?? null, replay: false };
  });

  // Broadcast only after commit.
  if (!result.replay) {
    const target = { orgId: ctx.org.id, locationSlug: ctx.location.slug };
    result.tickets.forEach((t) => emit({ ...target, channel: "kds" }, "ticket.created", toTicketDTO(t)));
    if (result.tableId) {
      emit({ ...target, channel: "floor" }, "table.updated", { id: result.tableId, status: "OCCUPIED" });
    }
  }
  return result;
}

async function recomputeTotals(tx: Prisma.TransactionClient, ctx: TenantContext, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { where: { isVoided: false } }, discount: true },
  });
  const totals = computeTotals(order.items, ctx.location, order.discount);
  return tx.order.update({ where: { id: orderId }, data: { ...totals, version: { increment: 1 } } });
}

// ─────────────────────────────── Payments ────────────────────────────────────

export async function capturePayment(
  ctx: TenantContext,
  orderId: string,
  input: z.infer<typeof CapturePaymentInput>,
) {
  const result = await withTenantTx(
    ctx.org.id,
    async (tx) => {
      const replay = await tx.payment.findFirst({ where: { idempotencyKey: { startsWith: input.idempotencyKey } } });
      if (replay) return { replay: true as const };

      const order = await tx.order.findFirst({
        where: { id: orderId, locationId: ctx.location.id },
        include: {
          items: { where: { isVoided: false }, include: { menuItem: { include: { category: true } } } },
          tables: true,
        },
      });
      if (!order) throw new HttpError(404, "Order not found");
      if (order.status === "PAID" || order.status === "VOID") throw new HttpError(409, `Order is ${order.status}`);

      const due = order.total - order.paidTotal;
      const weights =
        input.split.mode === "FULL"
          ? [1]
          : input.split.mode === "EQUAL"
            ? Array.from({ length: input.split.ways }, () => 1)
            : seatWeights(order.items);
      const shares = allocate(due, weights);
      if (input.tenders.length !== shares.length) {
        throw new HttpError(400, `Expected ${shares.length} tenders, got ${input.tenders.length}`);
      }

      const shift = await tx.shift.findFirst({
        where: { locationId: ctx.location.id, cashierId: ctx.membershipId, status: "OPEN" },
        select: { id: true },
      });

      for (const [i, amount] of shares.entries()) {
        const t = input.tenders[i];
        if (t.method === "CASH" && (t.tendered ?? amount) < amount) throw new HttpError(400, "Cash tendered is short");
        await tx.bill.create({
          data: {
            orderId,
            mode: input.split.mode,
            splitIndex: i + 1,
            splitCount: shares.length,
            amountDue: amount,
            amountPaid: amount,
            status: "PAID",
            payments: {
              create: {
                organizationId: ctx.org.id,
                locationId: ctx.location.id,
                orderId,
                shiftId: shift?.id,
                cashierId: ctx.membershipId,
                method: t.method,
                amount,
                tip: t.tip,
                tendered: t.method === "CASH" ? (t.tendered ?? amount) : null,
                change: t.method === "CASH" ? (t.tendered ?? amount) - amount : null,
                reference: t.reference,
                idempotencyKey: `${input.idempotencyKey}:${i}`,
              },
            },
          },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: "PAID", paidTotal: order.total, closedAt: new Date(), shiftId: shift?.id, version: { increment: 1 } },
      });
      const tableIds = order.tables.map((t) => t.tableId);
      if (tableIds.length) {
        await tx.diningTable.updateMany({
          where: { id: { in: tableIds } },
          data: { status: "NEEDS_CLEANING", statusChangedAt: new Date(), mergedIntoId: null, version: { increment: 1 } },
        });
      }

      await rollupSale(tx, ctx, order, input.tenders.map((t, i) => ({ method: t.method, amount: shares[i] })));
      return { replay: false as const, total: order.total, tableIds, shares };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  if (!result.replay) {
    const target = { orgId: ctx.org.id, locationSlug: ctx.location.slug };
    result.tableIds.forEach((id) =>
      emit({ ...target, channel: "floor" }, "table.updated", { id, status: "NEEDS_CLEANING" }),
    );
    emit({ ...target, channel: "dashboard" }, "payment.captured", { orderId, amount: result.total, method: "MIXED" });
  }
  return result;
}

function seatWeights(items: { seatNumber: number | null; lineTotal: number }[]) {
  const bySeat = new Map<number, number>();
  for (const i of items) bySeat.set(i.seatNumber ?? 0, (bySeat.get(i.seatNumber ?? 0) ?? 0) + i.lineTotal);
  return [...bySeat.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/** Incremental analytics rollup — dashboards never scan raw orders. */
async function rollupSale(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  order: {
    businessDate: Date;
    total: number;
    taxTotal: number;
    discountTotal: number;
    guestCount: number;
    items: { lineTotal: number; quantity: number; menuItem: { categoryId: string; category: { name: string } } }[];
  },
  tenders: { method: string; amount: number }[],
) {
  const key = { locationId_businessDate: { locationId: ctx.location.id, businessDate: order.businessDate } };
  await tx.dailySalesSummary.upsert({
    where: key,
    create: { organizationId: ctx.org.id, locationId: ctx.location.id, businessDate: order.businessDate },
    update: {},
  });
  // Row lock so concurrent payments don't clobber the JSON breakdowns.
  await tx.$queryRaw`SELECT 1 FROM "DailySalesSummary" WHERE "locationId" = ${ctx.location.id} AND "businessDate" = ${order.businessDate} FOR UPDATE`;
  const row = await tx.dailySalesSummary.findUniqueOrThrow({ where: key });

  const byMethod = { ...(row.byPaymentMethod as Record<string, number>) };
  tenders.forEach((t) => (byMethod[t.method] = (byMethod[t.method] ?? 0) + t.amount));

  const byCategory = { ...(row.byCategory as Record<string, { name: string; revenue: number; qty: number }>) };
  for (const i of order.items) {
    const c = (byCategory[i.menuItem.categoryId] ??= { name: i.menuItem.category.name, revenue: 0, qty: 0 });
    c.revenue += i.lineTotal;
    c.qty += i.quantity;
  }

  const byHour = Array.from({ length: 24 }, (_, h) => (row.byHour as number[])[h] ?? 0);
  byHour[localHour(ctx.location.timezone)] += order.total;

  await tx.dailySalesSummary.update({
    where: key,
    data: {
      grossRevenue: { increment: order.total },
      netRevenue: { increment: order.total - order.taxTotal },
      taxTotal: { increment: order.taxTotal },
      discountTotal: { increment: order.discountTotal },
      orderCount: { increment: 1 },
      guestCount: { increment: order.guestCount },
      byPaymentMethod: byMethod,
      byCategory,
      byHour,
    },
  });
}

// ──────────────────────────────── KDS ────────────────────────────────────────

const STAMP = { IN_PREPARATION: "startedAt", READY: "readyAt", SERVED: "servedAt" } as const;

export async function setTicketStatus(ctx: TenantContext, ticketId: string, status: TicketDTO["status"]) {
  await withTenantTx(ctx.org.id, async (tx) => {
    const t = await tx.kdsTicket.findFirst({ where: { id: ticketId, locationId: ctx.location.id } });
    if (!t) throw new HttpError(404, "Ticket not found");
    await tx.kdsTicket.update({
      where: { id: ticketId },
      data: { status, bumpedById: ctx.membershipId, ...(status !== "NEW" && { [STAMP[status]]: new Date() }) },
    });
    await tx.orderItem.updateMany({ where: { ticketId }, data: { status } });
  });
  emit({ orgId: ctx.org.id, locationSlug: ctx.location.slug, channel: "kds" }, "ticket.updated", { id: ticketId, status });
}
