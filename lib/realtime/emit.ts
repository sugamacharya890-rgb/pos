import type { RealtimeServer } from "./server";
import { room, type Channel, type ServerToClient } from "./events";

/** Called from route handlers after a successful DB commit. */
export function emit<E extends keyof ServerToClient>(
  target: { orgId: string; locationSlug: string; channel: Channel },
  event: E,
  ...payload: Parameters<ServerToClient[E]>
) {
  const io = (globalThis as { __io?: RealtimeServer }).__io;
  if (!io) return; // e.g. `next build`, scripts
  io.to(room(target.orgId, target.locationSlug, target.channel)).emit(event, ...payload);
}
