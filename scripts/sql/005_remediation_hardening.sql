-- 005_remediation_hardening.sql
-- Hardening skema untuk BF-010, BF-013, BF-017, BF-035, BF-036, NF-12, NF-14, NF-16

-- 1. Idempotency keys: simpan route, request_hash, response_status, response_body (BF-036)
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS route TEXT NOT NULL DEFAULT '';
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS response_status INTEGER NOT NULL DEFAULT 201;
DROP INDEX IF EXISTS idem_ws_key;
CREATE UNIQUE INDEX IF NOT EXISTS idem_ws_route_key ON idempotency_keys (workspace_id, route, key);

-- 2. Cashier shifts: pastikan hanya 1 shift terbuka per workspace (atau branch) secara atomik (BF-017)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_shifts_one_open
  ON cashier_shifts (workspace_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';

-- 3. Fixed asset depreciation: cegah double depreciation pada periode yang sama (BF-010)
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_dep_period
  ON asset_depreciation_logs (workspace_id, asset_id, period_month);

-- 4. Export records / durable artifact metadata (BF-013, BF-035, NF-16)
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS object_key TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS artifact_data BYTEA;

-- 5. Least privilege untuk api_rate_limits (NF-12, NF-14)
DO $$
BEGIN
  IF to_regclass('public.api_rate_limits') IS NOT NULL THEN
    REVOKE ALL ON TABLE api_rate_limits FROM bf_app;
  END IF;
END
$$;

-- 6. RLS fail-closed untuk jobs (NF-04)
DO $$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL THEN
    ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON jobs;
    CREATE POLICY tenant_isolation ON jobs
      USING (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        OR (workspace_id IS NULL AND NULLIF(current_setting('app.workspace_id', true), '') IS NULL)
      )
      WITH CHECK (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        OR (workspace_id IS NULL AND NULLIF(current_setting('app.workspace_id', true), '') IS NULL)
      );
    BEGIN
      GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO bf_app;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END
$$;

-- 7. Remediasi drift tabel devices (BF-002: default gen_random_uuid pada devices.id)
DO $$
BEGIN
  IF to_regclass('public.devices') IS NOT NULL THEN
    ALTER TABLE devices ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE devices ALTER COLUMN name SET DEFAULT 'Perangkat';
    ALTER TABLE devices ALTER COLUMN failed_attempts SET DEFAULT 0;
    ALTER TABLE devices ALTER COLUMN status SET DEFAULT 'active';
  END IF;
END
$$;


