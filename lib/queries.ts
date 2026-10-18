import "server-only";
import type { TenantContext } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant";
import type { ActiveOrderDTO, CategoryDTO, MenuItemDTO } from "@/components/pos/types";

/** Menu for one outlet: org-wide items with this location's overrides applied. */
export async function loadMenu(ctx: TenantContext): Promise<{ categories: CategoryDTO[]; items: MenuItemDTO[] }> {
  const db = tenantDb(ctx.org.id);
  const [categories, items] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.menuItem.findMany({
      where: { isArchived: false, isAvailable: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        locationPrices: { where: { locationId: ctx.location.id } },
        modifierGroups: { orderBy: { sortOrder: "asc" }, include: { group: { include: { modifiers: { orderBy: { sortOrder: "asc" } } } } } },
      },
    }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    items: items
      .filter((i) => i.locationPrices[0]?.isAvailable !== false)
      .map((i) => ({
        id: i.id,
        categoryId: i.categoryId,
        name: i.name,
        price: i.locationPrices[0]?.priceOverride ?? i.price,
        shortcode: i.shortcode,
        station: i.station,
        modifierGroups: i.modifierGroups.map(({ group: g }) => ({
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta })),
        })),
      })),
  };
}

export async function loadActiveOrders(ctx: TenantContext): Promise<ActiveOrderDTO[]> {
  const orders = await tenantDb(ctx.org.id).order.findMany({
    where: { locationId: ctx.location.id, status: { in: ["OPEN", "BILLED"] } },
    orderBy: { openedAt: "asc" },
    include: {
      tables: { include: { table: { select: { label: true } } }, orderBy: { isPrimary: "desc" } },
      items: { where: { isVoided: false }, include: { modifiers: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    number: o.number,
    tableLabel: o.tables.map((t) => t.table.label).join(" + ") || null,
    guestCount: o.guestCount,
    openedAt: o.openedAt.toISOString(),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    serviceCharge: o.serviceCharge,
    taxTotal: o.taxTotal,
    total: o.total,
    items: o.items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      seatNumber: i.seatNumber,
      modifiers: i.modifiers.map((m) => m.name),
    })),
  }));
}
