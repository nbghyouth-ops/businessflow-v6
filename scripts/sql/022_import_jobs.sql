-- 022_import_jobs: job langkah-kecil untuk impor besar + gerbang visibilitas baris
-- hasil impor (prompt R15 §2.1 / BF-088).
--
-- Sifat: aditif dan idempoten; melanjutkan nomor setelah 021. Tidak ada kolom hash
-- berkas (G-NOFP). Uang tetap BIGINT unit minor di tabel tujuan; tabel ini hanya
-- menyimpan progres + opsi yang dipilih pengguna (tanpa isi baris berkas).
--
-- `published_at` di tabel tujuan: baris hasil commit baru TERLIHAT oleh pembaca
-- (laporan/ekspor/rekonsiliasi) setelah diisi. Commit sinkron mengisinya dalam
-- transaksi yang sama; job langkah-kecil mengisinya hanya pada langkah penutup,
-- sehingga job yang dibatalkan/mati di tengah tidak pernah menampilkan data
-- setengah jadi.

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('PREVIEW', 'COMMIT')),
  state text NOT NULL DEFAULT 'QUEUED'
    CHECK (state IN ('QUEUED', 'RUNNING', 'PAUSED', 'DONE', 'FAILED', 'CANCELED')),
  report_type text NOT NULL,
  provider_code text,
  provider_label text,
  source_label text,
  filename text NOT NULL,
  sheet_name text NOT NULL,
  header_row integer NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  parsing jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel_id uuid,
  cash_account_id uuid,
  bank_alias_id uuid,
  profile_id uuid,
  profile_version integer,
  total integer NOT NULL DEFAULT 0,
  cursor integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  valid integer NOT NULL DEFAULT 0,
  warning integer NOT NULL DEFAULT 0,
  needs_mapping integer NOT NULL DEFAULT 0,
  invalid integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  chunk_size integer NOT NULL DEFAULT 500,
  batch_id uuid,
  result jsonb,
  error_code text,
  error_params jsonb,
  attempts integer NOT NULL DEFAULT 0,
  locked_by text,
  locked_until timestamptz,
  created_by uuid,
  device_id uuid,
  operator text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);

CREATE INDEX IF NOT EXISTS import_jobs_ws_created
  ON import_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_pending
  ON import_jobs(state, created_at) WHERE state IN ('QUEUED', 'RUNNING');

/* Isi berkas unggahan untuk job, privat per workspace (dihapus saat job selesai). */
CREATE TABLE IF NOT EXISTS import_job_files (
  job_id uuid PRIMARY KEY REFERENCES import_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content bytea NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

/* Gerbang visibilitas: baris hasil impor hanya terlihat setelah diterbitkan. */
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE marketplace_settlement_summaries ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE marketplace_settlement_lines ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS published_at timestamptz;

/* Baris lama sudah dipakai laporan sebelum kolom ini ada: terbitkan sekali. */
UPDATE marketplace_orders SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE marketplace_order_items SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE marketplace_settlement_summaries SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE marketplace_settlement_lines SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;
UPDATE bank_statement_lines SET published_at = COALESCE(created_at, now()) WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS marketplace_orders_published
  ON marketplace_orders(workspace_id, occurred_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_order_items_published
  ON marketplace_order_items(workspace_id, order_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS mkt_settlement_summaries_published
  ON marketplace_settlement_summaries(workspace_id, statement_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS mkt_settlement_lines_published
  ON marketplace_settlement_lines(workspace_id, statement_on DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_statement_lines_published
  ON bank_statement_lines(workspace_id, posted_on DESC) WHERE published_at IS NOT NULL;

/* RLS tenant: pola sama seperti migrasi 002/018/021. */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_jobs', 'import_job_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;

/*
 * Pekerja job harus melihat job SEMUA tenant untuk memilih yang tertua, sedangkan
 * permintaan pengguna tetap terkurung workspace-nya. Karena itu ada satu policy
 * tambahan yang hanya terbuka bila transaksi sistem menyetel `app.job_runner='on'`
 * (dilakukan `withJobRunner` di src/server/jobs/import-jobs.ts). Tidak ada jalur
 * request pengguna yang menyetel GUC tersebut.
 */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'job_runner' AND polrelid = 'import_jobs'::regclass) THEN
    CREATE POLICY job_runner ON import_jobs
      USING (current_setting('app.job_runner', true) = 'on')
      WITH CHECK (current_setting('app.job_runner', true) = 'on');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'job_runner' AND polrelid = 'import_job_files'::regclass) THEN
    CREATE POLICY job_runner ON import_job_files
      USING (current_setting('app.job_runner', true) = 'on')
      WITH CHECK (current_setting('app.job_runner', true) = 'on');
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_jobs, import_job_files TO bf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  marketplace_orders, marketplace_order_items, marketplace_settlement_summaries,
  marketplace_settlement_lines, bank_statement_lines
TO bf_app;

COMMENT ON TABLE import_jobs IS 'Job langkah-kecil impor (pratinjau/commit besar): progres, cursor, hitungan status, lease. Tanpa isi baris berkas.';
COMMENT ON TABLE import_job_files IS 'Isi berkas unggahan untuk job impor (privat per workspace, dihapus setelah job selesai).';
COMMENT ON COLUMN marketplace_orders.published_at IS 'Baris terlihat oleh laporan/ekspor hanya setelah terbit (commit selesai).';
