/**
 * Single source of truth for role → module access. Shared by middleware
 * (route guard), server layouts (authoritative check), API handlers, the
 * socket server (room joins) and the sidebar (what to render).
 */
export const ROLES = ["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "BAR"] as const;
export type Role = (typeof ROLES)[number];

export const MODULES = [
  "floor", // table floor plan
  "orders", // order taking
  "pos", // checkout, bill splitting, active tables
  "shift", // end-of-shift cash summary
  "kds", // kitchen display
  "analytics",
  "inventory",
  "menu",
  "staff",
  "settings",
] as const;
export type Module = (typeof MODULES)[number];

const ALL: readonly Module[] = MODULES;

export const ROLE_MODULES: Record<Role, readonly Module[]> = {
  OWNER: ALL,
  MANAGER: ALL,
  CASHIER: ["pos", "shift"],
  WAITER: ["floor", "orders"],
  KITCHEN: ["kds"],
  BAR: ["kds"],
};

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, Module> = {
  OWNER: "analytics",
  MANAGER: "analytics",
  CASHIER: "pos",
  WAITER: "floor",
  KITCHEN: "kds",
  BAR: "kds",
};

/** Fine-grained actions checked inside API handlers. */
export const ACTIONS = {
  "order.create": ["OWNER", "MANAGER", "WAITER", "CASHIER"],
  "order.void": ["OWNER", "MANAGER"],
  "order.discount": ["OWNER", "MANAGER", "CASHIER"],
  "order.discount.override": ["OWNER", "MANAGER"],
  "payment.capture": ["OWNER", "MANAGER", "CASHIER"],
  "payment.refund": ["OWNER", "MANAGER"],
  "ticket.bump": ["OWNER", "MANAGER", "KITCHEN", "BAR"],
  "ticket.serve": ["OWNER", "MANAGER", "KITCHEN", "BAR", "WAITER"],
  "table.status": ["OWNER", "MANAGER", "WAITER", "CASHIER"],
  "table.merge": ["OWNER", "MANAGER", "WAITER"],
  "table.transfer": ["OWNER", "MANAGER", "WAITER"],
  "floor.edit": ["OWNER", "MANAGER"],
  "shift.close": ["OWNER", "MANAGER", "CASHIER"],
  "location.manage": ["OWNER"],
} as const satisfies Record<string, readonly Role[]>;
export type Action = keyof typeof ACTIONS;

export const canAccess = (role: Role, module: Module) => ROLE_MODULES[role].includes(module);
export const can = (role: Role, action: Action) =>
  (ACTIONS[action] as readonly Role[]).includes(role);

/** KDS station a role is pinned to (managers can switch). */
export const roleStation = (role: Role) =>
  role === "BAR" ? "BAR" : role === "KITCHEN" ? "KITCHEN" : null;

export function isModule(x: string | undefined): x is Module {
  return !!x && (MODULES as readonly string[]).includes(x);
}
