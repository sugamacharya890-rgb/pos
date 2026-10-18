"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import type { Channel, ClientToServer, ServerToClient } from "./events";

type ClientSocket = Socket<ServerToClient, ClientToServer>;
let socket: ClientSocket | null = null;

function getSocket() {
  // Cookie auth (same origin); auto-reconnect with backoff is socket.io's default.
  socket ??= io({ path: "/rt", withCredentials: true, transports: ["websocket"] });
  return socket;
}

/** Live/offline indicator for the top bar. */
export function useConnectionStatus() {
  return useSyncExternalStore(
    (cb) => {
      const s = getSocket();
      s.on("connect", cb);
      s.on("disconnect", cb);
      return () => {
        s.off("connect", cb);
        s.off("disconnect", cb);
      };
    },
    () => getSocket().connected,
    () => false,
  );
}

/**
 * Join a location channel and subscribe to events. Re-joins automatically on
 * reconnect; `onResync` fires after a reconnect so the view can refetch
 * anything it missed while offline.
 */
export function useChannel(
  target: { org: string; location: string; channel: Channel },
  handlers: Partial<ServerToClient>,
  onResync?: () => void,
) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const { org, location, channel } = target;

  useEffect(() => {
    const s = getSocket();
    let first = true;
    const join = () => {
      s.emit("join", { org, location, channel }, () => {
        if (!first) onResync?.();
        first = false;
      });
    };
    const listeners = Object.keys(ref.current).map((event) => {
      const fn = (...args: unknown[]) =>
        (ref.current[event as keyof ServerToClient] as ((...a: unknown[]) => void) | undefined)?.(...args);
      s.on(event as keyof ServerToClient, fn as never);
      return [event, fn] as const;
    });
    if (s.connected) join();
    s.on("connect", join);
    return () => {
      s.off("connect", join);
      listeners.forEach(([e, fn]) => s.off(e as keyof ServerToClient, fn as never));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, location, channel]);
}
