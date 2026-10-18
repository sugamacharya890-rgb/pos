-- =============================================================================
-- Row-Level Security: the database-level wall between franchise owners.
--
-- Run after every migration (npm run db:rls). Idempotent.
--
-- Two roles:
--   * table owner (migrations, auth, background rollups) — SYSTEM_DATABASE_URL
--   * rms_app     (every request-scoped query)           — DATABASE_URL
--
-- rms_app only ever sees rows whose "organizationId" equals the transaction
-- setting app.org_id, which lib/db/tenant.ts sets with set_config(..., true).
-- If a code path forgets to set it, current_setting returns NULL/'' and the
-- query returns zero rows: the system fails CLOSED, never open.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rms_app') THEN
    -- Change this password in production (ALTER ROLE rms_app PASSWORD ...).
    CREATE ROLE rms_app LOGIN PASSWORD 'rms_app' NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO rms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rms_app;

-- Identity tables are only touched by the system client.
REVOKE ALL ON "User", "Session", "Brand", "BrandMember" FROM rms_app;
GRANT SELECT ("id", "name", "email", "avatarUrl") ON "User" TO rms_app;

-- Every table that carries "organizationId" gets an isolation policy.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organizationId'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO rms_app
         USING ("organizationId" = current_setting(''app.org_id'', true))
         WITH CHECK ("organizationId" = current_setting(''app.org_id'', true))',
      t.table_name);
  END LOOP;
END $$;

-- Organization itself is keyed by "id".
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization" TO rms_app
  USING ("id" = current_setting('app.org_id', true))
  WITH CHECK ("id" = current_setting('app.org_id', true));

-- Child tables without their own organizationId inherit isolation from parent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('OrderTable',        '"orderId" IN (SELECT "id" FROM "Order")'),
      ('OrderItemModifier', '"orderItemId" IN (SELECT "id" FROM "OrderItem")'),
      ('Bill',              '"orderId" IN (SELECT "id" FROM "Order")'),
      ('BillLine',          '"billId" IN (SELECT "id" FROM "Bill")'),
      ('CashMovement',      '"shiftId" IN (SELECT "id" FROM "Shift")')
    ) AS v(tbl, expr)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.tbl);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO rms_app USING (%s) WITH CHECK (%s)',
                   r.tbl, r.expr, r.expr);
  END LOOP;
END $$;
