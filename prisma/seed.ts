/**
 * Demo data: one brand, TWO independent franchise owners.
 *
 *   Himalayan Bites (brand)
 *   ├─ Everest Foods      owner@everest.test   → Thamel, Patan
 *   └─ Annapurna Hosp.    owner@annapurna.test → Lakeside
 *
 * Every user's password: password123
 */
import { PrismaClient, type Role, type Station, type TableShape } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient({ datasourceUrl: process.env.SYSTEM_DATABASE_URL });
const DAY = 86_400_000;
/** Today's business date in the outlets' timezone (matches lib/auth/api.ts businessDate). */
const TODAY = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date())}T00:00:00Z`);

// Deterministic PRNG so the demo looks the same on every machine.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const MENU: { name: string; color: string; station: Station; items: [string, number, string][] }[] = [
  { name: "Momo", color: "#e2763a", station: "KITCHEN", items: [["Chicken Momo", 32000, "M1"], ["Buff Momo", 30000, "M2"], ["Veg Momo", 26000, "M3"], ["Jhol Momo", 36000, "M4"], ["C-Momo", 38000, "M5"]] },
  { name: "Mains", color: "#3f8f5b", station: "KITCHEN", items: [["Dal Bhat Set", 55000, "D1"], ["Chicken Thali", 65000, "D2"], ["Thukpa", 35000, "D3"], ["Chowmein", 30000, "D4"], ["Sekuwa Platter", 72000, "D5"]] },
  { name: "Snacks", color: "#c4a032", station: "KITCHEN", items: [["Aloo Sadeko", 22000, "S1"], ["Chatamari", 28000, "S2"], ["Bara", 25000, "S3"], ["French Fries", 24000, "S4"]] },
  { name: "Drinks", color: "#3a78c9", station: "BAR", items: [["Masala Chiya", 9000, "B1"], ["Lassi", 18000, "B2"], ["Fresh Lime Soda", 16000, "B3"], ["Everest Beer", 65000, "B4"], ["Espresso", 15000, "B5"], ["Mojito", 55000, "B6"]] },
  { name: "Desserts", color: "#a35bc4", station: "KITCHEN", items: [["Juju Dhau", 20000, "X1"], ["Sel Roti & Curd", 22000, "X2"], ["Kheer", 18000, "X3"]] },
];

const FLOOR: { name: string; tables: [string, number, TableShape, number, number][] }[] = [
  { name: "Main Dining", tables: [["T1", 4, "SQUARE", 80, 80], ["T2", 4, "SQUARE", 280, 80], ["T3", 2, "ROUND", 480, 80], ["T4", 6, "RECTANGLE", 80, 300], ["T5", 4, "SQUARE", 380, 300], ["T6", 2, "ROUND", 600, 300], ["T7", 8, "RECTANGLE", 80, 520], ["T8", 4, "BOOTH", 420, 520]] },
  { name: "Patio", tables: [["P1", 4, "ROUND", 100, 120], ["P2", 4, "ROUND", 360, 120], ["P3", 2, "ROUND", 620, 120], ["P4", 6, "RECTANGLE", 200, 420]] },
  { name: "Bar", tables: [["B1", 2, "ROUND", 120, 140], ["B2", 2, "ROUND", 320, 140], ["B3", 2, "ROUND", 520, 140], ["B4", 4, "BOOTH", 220, 420]] },
];

async function main() {
  // Wipe in one statement; CASCADE handles FK order.
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);

  const passwordHash = await bcrypt.hash("password123", 10);
  const brand = await db.brand.create({ data: { name: "Himalayan Bites", slug: "himalayan-bites" } });

  await createFranchise({
    brandId: brand.id,
    name: "Everest Foods",
    slug: "everest",
    domain: "everest.test",
    locations: [
      { name: "Thamel", slug: "thamel", address: "Thamel Marg, Kathmandu" },
      { name: "Patan", slug: "patan", address: "Mangal Bazar, Lalitpur" },
    ],
    passwordHash,
  });
  await createFranchise({
    brandId: brand.id,
    name: "Annapurna Hospitality",
    slug: "annapurna",
    domain: "annapurna.test",
    locations: [{ name: "Lakeside", slug: "lakeside", address: "Lakeside Rd, Pokhara" }],
    passwordHash,
  });

  console.log("Seeded. Log in with e.g. owner@everest.test / password123");
}

async function createFranchise(f: {
  brandId: string;
  name: string;
  slug: string;
  domain: string;
  locations: { name: string; slug: string; address: string }[];
  passwordHash: string;
}) {
  const org = await db.organization.create({
    data: { brandId: f.brandId, name: f.name, slug: f.slug, currency: "NPR", shareWithBrand: true },
  });
  const locations: Awaited<ReturnType<typeof db.location.create>>[] = [];
  for (const l of f.locations) {
    locations.push(
      await db.location.create({
        data: { organizationId: org.id, ...l, timezone: "Asia/Kathmandu", taxRateBps: 1300, serviceChargeBps: 1000 },
      }),
    );
  }

  // ── People ────────────────────────────────────────────────────────────────
  const person = async (local: string, name: string, role: Role, locs: typeof locations | "all") => {
    const user = await db.user.create({ data: { email: `${local}@${f.domain}`, name, passwordHash: f.passwordHash } });
    return db.membership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role,
        allLocations: locs === "all",
        locations: locs === "all" ? undefined : { create: locs.map((l) => ({ locationId: l.id })) },
      },
    });
  };
  const first = f.slug === "everest" ? ["Aarav", "Priya", "Bikash", "Sunita", "Ramesh", "Kiran"] : ["Sita", "Manish", "Anjali", "Deepak", "Gita", "Rohan"];
  await person("owner", `${first[0]} (Owner)`, "OWNER", "all");
  await person("manager", `${first[1]} (Manager)`, "MANAGER", locations);
  await person("cashier", `${first[2]} (Cashier)`, "CASHIER", [locations[0]]);
  const waiter = await person("waiter", `${first[3]} (Waiter)`, "WAITER", [locations[0]]);
  await person("kitchen", `${first[4]} (Kitchen)`, "KITCHEN", [locations[0]]);
  await person("bar", `${first[5]} (Bar)`, "BAR", [locations[0]]);

  // ── Menu (org-level, shared by all outlets) ──────────────────────────────
  const spice = await db.modifierGroup.create({
    data: {
      organizationId: org.id,
      name: "Spice level",
      minSelect: 1,
      maxSelect: 1,
      modifiers: { create: ["Mild", "Medium", "Hot", "Extra hot"].map((n, i) => ({ name: n, sortOrder: i })) },
    },
  });
  const extras = await db.modifierGroup.create({
    data: {
      organizationId: org.id,
      name: "Extras",
      maxSelect: 3,
      modifiers: {
        create: [["Extra sauce", 3000], ["Extra cheese", 5000], ["Sesame achar", 2000], ["Fried egg", 4000]].map(([n, p], i) => ({
          name: n as string,
          priceDelta: p as number,
          sortOrder: i,
        })),
      },
    },
  });

  const menuItems: { id: string; name: string; price: number; categoryId: string; categoryName: string; station: Station }[] = [];
  for (const [ci, c] of MENU.entries()) {
    const cat = await db.category.create({ data: { organizationId: org.id, name: c.name, color: c.color, sortOrder: ci } });
    for (const [name, price, shortcode] of c.items) {
      const item = await db.menuItem.create({
        data: { organizationId: org.id, categoryId: cat.id, name, price, shortcode, station: c.station },
      });
      if (c.name === "Momo" || c.name === "Mains") {
        await db.menuItemModifierGroup.createMany({
          data: [
            { organizationId: org.id, menuItemId: item.id, modifierGroupId: spice.id, sortOrder: 0 },
            { organizationId: org.id, menuItemId: item.id, modifierGroupId: extras.id, sortOrder: 1 },
          ],
        });
      }
      menuItems.push({ id: item.id, name, price, categoryId: cat.id, categoryName: c.name, station: c.station });
    }
  }

  // ── Inventory ────────────────────────────────────────────────────────────
  const stock = [["Flour", "kg", 40, 10], ["Chicken", "kg", 6, 8], ["Buff meat", "kg", 12, 5], ["Cabbage", "kg", 9, 4], ["Rice", "kg", 50, 15], ["Lentils", "kg", 18, 5], ["Milk", "L", 4, 10], ["Beer (bottle)", "pcs", 96, 24]] as const;
  for (const [name, unit, onHand, reorder] of stock) {
    const inv = await db.inventoryItem.create({ data: { organizationId: org.id, name, unit } });
    for (const loc of locations) {
      await db.stockLevel.create({
        data: { organizationId: org.id, locationId: loc.id, inventoryItemId: inv.id, onHand: onHand * (loc === locations[0] ? 1 : 1.5), reorderLevel: reorder },
      });
    }
  }

  // ── Floor + history per location ─────────────────────────────────────────
  for (const loc of locations) {
    const tables: { id: string; label: string }[] = [];
    for (const [ai, a] of FLOOR.entries()) {
      const area = await db.floorArea.create({
        data: { organizationId: org.id, locationId: loc.id, name: a.name, sortOrder: ai, width: 900, height: 700 },
      });
      for (const [label, seats, shape, x, y] of a.tables) {
        const wide = shape === "RECTANGLE" || shape === "BOOTH";
        tables.push(
          await db.diningTable.create({
            data: {
              organizationId: org.id,
              locationId: loc.id,
              floorAreaId: area.id,
              label,
              seats,
              shape,
              posX: x,
              posY: y,
              width: wide ? 200 : 120,
              height: 120,
            },
          }),
        );
      }
    }

    // 30 days of paid orders → rollups (so analytics has something to show).
    const scale = loc === locations[0] ? 1 : 0.6;
    for (let d = 29; d >= 0; d--) {
      const date = new Date(TODAY.getTime() - d * DAY);
      const count = Math.round((14 + rand() * 18) * scale * (date.getUTCDay() === 5 || date.getUTCDay() === 6 ? 1.4 : 1));
      const byHour = Array(24).fill(0);
      const byMethod: Record<string, number> = {};
      const byCategory: Record<string, { name: string; revenue: number; qty: number }> = {};
      let gross = 0, tax = 0, guests = 0;
      for (let n = 1; n <= count; n++) {
        const hour = pick([8, 9, 12, 12, 13, 13, 13, 14, 18, 19, 19, 19, 20, 20, 21]);
        const lines = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => ({ item: pick(menuItems), qty: 1 + Math.floor(rand() * 2) }));
        const subtotal = lines.reduce((s, l) => s + l.item.price * l.qty, 0);
        const service = Math.round(subtotal * 0.1);
        const t = Math.round((subtotal + service) * 0.13);
        const total = subtotal + service + t;
        const method = pick(["CASH", "CASH", "CARD", "CARD", "CARD", "MOBILE", "MOBILE"] as const);
        const guestCount = 1 + Math.floor(rand() * 4);
        const openedAt = new Date(date.getTime() + (hour - 5.75) * 3_600_000); // NPT → UTC
        await db.order.create({
          data: {
            organizationId: org.id,
            locationId: loc.id,
            number: n,
            businessDate: date,
            status: "PAID",
            guestCount,
            subtotal,
            serviceCharge: service,
            taxTotal: t,
            total,
            paidTotal: total,
            openedAt,
            closedAt: new Date(openedAt.getTime() + 50 * 60_000),
            items: {
              create: lines.map((l) => ({
                menuItemId: l.item.id,
                name: l.item.name,
                unitPrice: l.item.price,
                quantity: l.qty,
                lineTotal: l.item.price * l.qty,
                station: l.item.station,
                status: "SERVED",
              })),
            },
            payments: { create: { locationId: loc.id, method, amount: total, createdAt: openedAt } },
          },
        });
        gross += total;
        tax += t;
        guests += guestCount;
        byHour[hour] += total;
        byMethod[method] = (byMethod[method] ?? 0) + total;
        for (const l of lines) {
          const c = (byCategory[l.item.categoryId] ??= { name: l.item.categoryName, revenue: 0, qty: 0 });
          c.revenue += l.item.price * l.qty;
          c.qty += l.qty;
        }
      }
      await db.dailySalesSummary.create({
        data: { organizationId: org.id, locationId: loc.id, businessDate: date, grossRevenue: gross, netRevenue: gross - tax, taxTotal: tax, orderCount: count, guestCount: guests, byHour, byPaymentMethod: byMethod, byCategory },
      });
      await db.orderCounter.create({ data: { organizationId: org.id, locationId: loc.id, businessDate: date, lastNumber: count } });
    }

    // Live service right now: a few occupied tables with tickets in the KDS.
    const today = TODAY;
    const counter = await db.orderCounter.findUniqueOrThrow({ where: { locationId_businessDate: { locationId: loc.id, businessDate: today } } });
    const live: [string, number, ("NEW" | "IN_PREPARATION" | "READY")][] = [["T1", 4, "NEW"], ["T4", 13, "IN_PREPARATION"], ["P2", 24, "READY"], ["B1", 2, "NEW"]];
    for (const [k, [label, minsAgo, status]] of live.entries()) {
      const table = tables.find((t) => t.label === label)!;
      const lines = [pick(menuItems.filter((m) => m.station === "KITCHEN")), pick(menuItems.filter((m) => m.station === "KITCHEN")), pick(menuItems.filter((m) => m.station === "BAR"))];
      const subtotal = lines.reduce((s, l) => s + l.price, 0);
      const service = Math.round(subtotal * 0.1);
      const t = Math.round((subtotal + service) * 0.13);
      const firedAt = new Date(Date.now() - minsAgo * 60_000);
      const order = await db.order.create({
        data: {
          organizationId: org.id,
          locationId: loc.id,
          number: counter.lastNumber + k + 1,
          businessDate: today,
          status: "OPEN",
          guestCount: 2,
          waiterId: waiter.id,
          subtotal,
          serviceCharge: service,
          taxTotal: t,
          total: subtotal + service + t,
          openedAt: firedAt,
          tables: { create: { tableId: table.id } },
        },
      });
      for (const station of ["KITCHEN", "BAR"] as const) {
        const ticket = await db.kdsTicket.create({
          data: { organizationId: org.id, locationId: loc.id, orderId: order.id, station, status, firedAt },
        });
        for (const [i, l] of lines.entries()) {
          if (l.station !== station) continue;
          await db.orderItem.create({
            data: {
              organizationId: org.id,
              orderId: order.id,
              menuItemId: l.id,
              ticketId: ticket.id,
              name: l.name,
              unitPrice: l.price,
              lineTotal: l.price,
              station,
              status,
              seatNumber: i + 1,
              notes: i === 0 && k === 1 ? "No onions" : null,
            },
          });
        }
      }
      await db.diningTable.update({ where: { id: table.id }, data: { status: "OCCUPIED" } });
    }
    await db.orderCounter.update({ where: { locationId_businessDate: { locationId: loc.id, businessDate: today } }, data: { lastNumber: { increment: live.length } } });
    await db.diningTable.updateMany({ where: { locationId: loc.id, label: { in: ["T6", "P3"] } }, data: { status: "RESERVED" } });
    await db.diningTable.updateMany({ where: { locationId: loc.id, label: "T2" }, data: { status: "NEEDS_CLEANING" } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
