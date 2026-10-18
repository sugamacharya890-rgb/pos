import "server-only";
import { NextResponse } from "next/server";
import { getClaims, resolveTenant, type TenantContext } from "./session";
import { can, type Action } from "./rbac";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Route-handler guard: authenticated, member of this org+location, allowed this action. */
export async function apiTenant(params: Promise<{ org: string; location: string }>, action: Action) {
  const { org, location } = await params;
  const claims = await getClaims();
  if (!claims) throw new HttpError(401, "Unauthenticated");
  const ctx = await resolveTenant(claims, org, location);
  if (!ctx) throw new HttpError(404, "Not found");
  if (!can(ctx.role, action)) throw new HttpError(403, "Forbidden");
  return ctx;
}

/** Wrap a handler so thrown HttpErrors become JSON responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export type { TenantContext };

/** YYYY-MM-DD in the outlet's own timezone (a 1am sale belongs to last night's service). */
export function businessDate(timezone: string, at = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function localHour(timezone: string, at = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(at));
}
