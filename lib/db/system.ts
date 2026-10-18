import { PrismaClient } from "@prisma/client";

/**
 * Owner-role client. Bypasses Row-Level Security.
 * ONLY for: authentication, cross-tenant background jobs (rollups),
 * provisioning new organizations. Never import from a route that serves
 * tenant data — use `tenantDb()` instead.
 */
const g = globalThis as unknown as { __systemDb?: PrismaClient };

export const systemDb =
  g.__systemDb ??
  new PrismaClient({ datasourceUrl: process.env.SYSTEM_DATABASE_URL });

if (process.env.NODE_ENV !== "production") g.__systemDb = systemDb;
