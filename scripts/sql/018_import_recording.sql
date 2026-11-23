-- 018_import_recording: pencatatan hasil impor berkas (prompt R7-C §4).
--
-- Semua tabel di sini adalah CATATAN atas fakta yang sudah terjadi di luar aplikasi:
-- pesanan marketplace, rincian settlement, pencairan tercatat, retur tercatat, dan
-- mutasi rekening bank. Tidak ada tabel dana, tidak ada kredensial, tidak ada
-- instruksi transaksi (prompt R7-C §1).
--
-- Additif + idempoten. Nomor migrasi melanjutkan setelah 017 (tidak menimpa apa pun).

/* ── Provenance pada batch impor yang sudah ada ── */
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS template TEXT,
  ADD COLUMN IF NOT EXISTS template_version TEXT,
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID;

CREATE INDEX IF NOT EXISTS import_batches_ws_created ON import_batches(workspace_id, created_at DESC);
-- Indeks file_hash NON-unik: berkas yang sama boleh diimpor ulang (mis. setelah
-- rentang diperbaiki), dan dedup terjadi di tingkat baris lewat `source_key`.
CREATE INDEX IF NOT EXISTS import_batches_ws_hash ON import_batches(workspace_id, file_hash)
  WHERE file_hash IS NOT NULL;

/* ── Baris per-baris hasil impor (galat berstruktur code+params) ── */
CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | inserted | duplicate | invalid
  code TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_key TEXT,
  target_table TEXT,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_rows_batch ON import_rows(batch_id, row_no);
CREATE INDEX IF NOT EXISTS import_rows_key ON import_rows(workspace_id, source_key);

/* ── Provenance pada pesanan marketplace yang sudah ada ── */
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS source_template TEXT,
  ADD COLUMN IF NOT EXISTS source_row INTEGER,
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS external_order_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_source_key
  ON marketplace_orders(workspace_id, source_key) WHERE source_key IS NOT NULL;

/* ── Rincian settlement per pesanan/penyesuaian (dari berkas marketplace) ── */
CREATE TABLE IF NOT EXISTS marketplace_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  statement_id TEXT,
  external_payment_ref TEXT,
  entry_type TEXT NOT NULL DEFAULT 'order', -- order | adjustment
  order_or_adjustment_id TEXT,
  related_order_ref TEXT,
  sku TEXT,
  currency TEXT,
  statement_on DATE,
  net_sales BIGINT,
  shipping BIGINT,
  fees BIGINT,
  adjustment BIGINT,
  total_settlement BIGINT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_settlement_lines_key
  ON marketplace_settlement_lines(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_settlement_lines_ws_date
  ON marketplace_settlement_lines(workspace_id, statement_on DESC);

/* ── Pencairan TERCATAT (dana sudah masuk; aplikasi tidak mencairkan apa pun) ── */
CREATE TABLE IF NOT EXISTS marketplace_cash_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES marketplace_channels(id) ON DELETE SET NULL,
  external_payment_ref TEXT,
  amount BIGINT NOT NULL,
  currency TEXT,
  recorded_status TEXT NOT NULL DEFAULT 'recorded', -- recorded | reconciled
  occurred_on DATE,
  cash_account_id uuid,
  note TEXT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_cash_receipts_key
  ON marketplace_cash_receipts(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_cash_receipts_ws_date
  ON marketplace_cash_receipts(workspace_id, occurred_on DESC);

/* ── Retur/refund TERCATAT (diputuskan & diselesaikan di luar aplikasi) ── */
CREATE TABLE IF NOT EXISTS marketplace_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES marketplace_channels(id) ON DELETE SET NULL,
  order_ref TEXT,
  return_ref TEXT,
  amount BIGINT,
  currency TEXT,
  occurred_on DATE,
  note TEXT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  source_row INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_returns_key
  ON marketplace_returns(workspace_id, source_key) WHERE source_key IS NOT NULL;

/* ── Mutasi bank hasil impor berkas (bukan pendapatan/biaya otomatis) ── */
CREATE TABLE IF NOT EXISTS bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cash_account_id uuid,
  bank TEXT NOT NULL,
  account_last4 TEXT CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$'),
  period_start DATE,
  period_end DATE,
  opening_balance BIGINT,
  closing_balance BIGINT,
  file_hash TEXT,
  template TEXT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_statements_ws_period ON bank_statements(workspace_id, period_end DESC);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  posted_on DATE,
  description TEXT NOT NULL DEFAULT '',
  branch TEXT,
  amount BIGINT,
  balance BIGINT,
  direction TEXT, -- debit | credit | null (tidak dipaksakan)
  suggestion TEXT, -- saran klasifikasi; WAJIB dikonfirmasi pengguna
  suggestion_confirmed BOOLEAN NOT NULL DEFAULT false,
  source_row INTEGER,
  seq INTEGER,
  source_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_key
  ON bank_statement_lines(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_statement_lines_ws_date ON bank_statement_lines(workspace_id, posted_on DESC);

/* ── Pencocokan (order ↔ settlement ↔ pencairan ↔ baris bank) ── */
CREATE TABLE IF NOT EXISTS marketplace_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  settlement_line_id uuid REFERENCES marketplace_settlement_lines(id) ON DELETE CASCADE,
  cash_receipt_id uuid REFERENCES marketplace_cash_receipts(id) ON DELETE CASCADE,
  bank_line_id uuid REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unmatched', -- matched | difference | unmatched | incomplete
  difference BIGINT,
  score INTEGER,
  reason TEXT,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_reconciliations_ws_status ON marketplace_reconciliations(workspace_id, status);

/* ── RLS: semua tabel baru bertenant (ENABLE + FORCE + policy workspace) ── */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'import_rows', 'marketplace_settlement_lines', 'marketplace_cash_receipts', 'marketplace_returns',
    'bank_statements', 'bank_statement_lines', 'marketplace_reconciliations'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
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

/* ── Kunci unik komposit (workspace_id, id) + FK tenant-aware ── */
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_ws_id ON import_batches(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_ws_id ON marketplace_orders(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_settlement_lines_ws_id ON marketplace_settlement_lines(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_cash_receipts_ws_id ON marketplace_cash_receipts(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_ws_id ON bank_statement_lines(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_statements_ws_id ON bank_statements(workspace_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_rows_batch_fk') THEN
    ALTER TABLE import_rows ADD CONSTRAINT import_rows_batch_fk
      FOREIGN KEY (workspace_id, batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_lines_channel_fk') THEN
    ALTER TABLE marketplace_settlement_lines ADD CONSTRAINT mkt_settlement_lines_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_statement_fk') THEN
    ALTER TABLE bank_statement_lines ADD CONSTRAINT bank_statement_lines_statement_fk
      FOREIGN KEY (workspace_id, statement_id) REFERENCES bank_statements(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_orders_batch_fk') THEN
    ALTER TABLE marketplace_orders ADD CONSTRAINT mkt_orders_batch_fk
      FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE SET NULL;
  END IF;
END
$$;

/* ── Hak akses untuk peran aplikasi (pola sama seperti migrasi 002/003) ── */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  import_rows, marketplace_settlement_lines, marketplace_cash_receipts, marketplace_returns,
  bank_statements, bank_statement_lines, marketplace_reconciliations
TO bf_app;

COMMENT ON TABLE marketplace_cash_receipts IS 'Pencairan TERCATAT dari marketplace (dana sudah masuk di luar aplikasi); aplikasi tidak mencairkan dana.';
COMMENT ON TABLE marketplace_returns IS 'Retur/refund TERCATAT yang diputuskan dan diselesaikan di luar aplikasi.';
COMMENT ON TABLE bank_statement_lines IS 'Catatan mutasi rekening hasil impor berkas; bukan pendapatan/biaya otomatis dan menunggu konfirmasi pengguna.';
