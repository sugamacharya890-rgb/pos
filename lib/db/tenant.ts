import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Restricted-role client (`rms_app`). Every query runs inside a transaction
 * that first sets `app.org_id`; the RLS policies in prisma/rls.sql then make
 * other franchise owners' rows invisible and unwritable.
 */
const g = globalThis as unknown as { __appDb?: PrismaClient };

const appDb =
  g.__appDb ?? new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") g.__appDb = appDb;

const setTenant = (orgId: string) =>
  appDb.$executeRaw`SELECT set_config('app.org_id', ${orgId}, TRUE)`;

/** Single-statement tenant-scoped client: `tenantDb(orgId).order.findMany()` */
export function tenantDb(orgId: string) {
  return appDb.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await appDb.$transaction([setTenant(orgId), query(args)]);
          return result;
        },
      },
    },
  });
}

/** Multi-statement unit of work (place order, take payment, close shift). */
export function withTenantTx<T>(
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
) {
  return appDb.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, TRUE)`;
    return fn(tx);
  }, options);
}
