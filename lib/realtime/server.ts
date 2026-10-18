import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { ACCESS_COOKIE, membershipFor, verifyAccessToken, type AccessClaims } from "@/lib/auth/jwt";
import { canAccess, type Module } from "@/lib/auth/rbac";
import { room, type Channel, type ClientToServer, type ServerToClient } from "./events";

const CHANNEL_MODULE: Record<Channel, Module[]> = {
  floor: ["floor", "pos"],
  kds: ["kds", "floor"], // waiters watch "ready" pickups
  pos: ["pos", "floor"],
  dashboard: ["analytics"],
};

type Data = { claims: AccessClaims };

export function attachRealtime(http: HttpServer) {
  const io = new Server<ClientToServer, ServerToClient, Record<string, never>, Data>(http, {
    path: "/rt",
    // For >1 node: io.adapter(createAdapter(redisPub, redisSub)) — see docs/ARCHITECTURE.md
  });

  // Authenticate the handshake with the same httpOnly cookie the app uses.
  io.use(async (socket, next) => {
    const cookie = socket.handshake.headers.cookie ?? "";
    const token = cookie
      .split(";")
      .map((c) => c.trim().split("="))
      .find(([k]) => k === ACCESS_COOKIE)?.[1];
    const claims = await verifyAccessToken(token);
    if (!claims) return next(new Error("unauthorized"));
    socket.data.claims = claims;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("join", ({ org, location, channel }, ack) => {
      const m = membershipFor(socket.data.claims, org, location);
      if (!m || !CHANNEL_MODULE[channel]?.some((mod) => canAccess(m.r, mod))) {
        return ack({ ok: false, error: "forbidden" });
      }
      socket.join(room(m.o, location, channel));
      ack({ ok: true });
    });
  });

  (globalThis as { __io?: typeof io }).__io = io;
  return io;
}

export type RealtimeServer = ReturnType<typeof attachRealtime>;
