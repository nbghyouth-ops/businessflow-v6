-- 021_marketplace_bank_settlement: model data pencatatan marketplace, settlement,
-- rekening bank, pemetaan SKU, dan rekonsiliasi (prompt R13 bagian 3.1 / R10-T3).
--
-- Sifat: CATATAN atas fakta yang sudah terjadi di luar aplikasi. Tidak ada tabel dana,
-- tidak ada kredensial, tidak ada instruksi pembayaran/transfer/refund, tidak ada
-- kolom hash berkas (G-NOFP). Nominal uang = BIGINT unit minor (bilangan bulat),
-- tanpa float. Semua tabel bertenant: RLS ENABLE+FORCE + GRANT eksplisit ke bf_app.
--
-- Additif dan idempoten; melanjutkan nomor setelah 020.

/* Rincian item pesanan marketplace (target impor `orders_items`) */
CREATE TABLE IF NOT EXISTS marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  order_id uuid,
  external_order_ref text NOT NULL,
  external_item_ref text,
  seller_sku text,
  platform_sku text,
  product_name_raw text,
  variant_raw text,
  quantity BIGINT,
  unit_price BIGINT,
  gross_line_amount BIGINT,
  seller_discount_amount BIGINT,
  platform_discount_amount BIGINT,
  currency text,
  order_on date,
  identify_note text,
  import_batch_id uuid,
  source_row integer,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_items_source_key
  ON marketplace_order_items(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_order_items_ws_order
  ON marketplace_order_items(workspace_id, external_order_ref);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_items_ws_id
  ON marketplace_order_items(workspace_id, id);

/* Ringkasan statement settlement (target impor `settlement_summary`) */
CREATE TABLE IF NOT EXISTS marketplace_settlement_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  statement_reference text,
  statement_on date,
  period_start date,
  period_end date,
  currency text,
  gross_or_net_total BIGINT,
  fee_total BIGINT,
  adjustment_total BIGINT,
  settlement_total BIGINT NOT NULL,
  reserve_or_hold_amount BIGINT,
  reconciliation_level text NOT NULL DEFAULT 'summary_only',
  note text,
  import_batch_id uuid,
  source_row integer,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_settlement_summaries_source_key
  ON marketplace_settlement_summaries(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_settlement_summaries_ws_date
  ON marketplace_settlement_summaries(workspace_id, statement_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_settlement_summaries_ws_id
  ON marketplace_settlement_summaries(workspace_id, id);

/* Referensi pembayaran eksternal (teks rujukan, BUKAN instruksi pembayaran apa pun) */
CREATE TABLE IF NOT EXISTS marketplace_external_payment_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid,
  external_payment_ref text NOT NULL,
  statement_reference text,
  amount BIGINT,
  currency text,
  referenced_on date,
  settlement_summary_id uuid,
  settlement_line_id uuid,
  import_batch_id uuid,
  source_row integer,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_ext_payment_refs_source_key
  ON marketplace_external_payment_references(workspace_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_ext_payment_refs_ws_ref
  ON marketplace_external_payment_references(workspace_id, external_payment_ref);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_ext_payment_refs_ws_id
  ON marketplace_external_payment_references(workspace_id, id);

/* Pemetaan SKU eksternal -> produk internal (per workspace + kanal). TIDAK mengubah
   stok/HPP dan tidak menyinkronkan apa pun ke marketplace. */
CREATE TABLE IF NOT EXISTS marketplace_sku_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  external_sku text NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_sku_mappings_key
  ON marketplace_sku_mappings(workspace_id, channel_id, lower(external_sku));
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_sku_mappings_ws_id
  ON marketplace_sku_mappings(workspace_id, id);

/* Alias rekening bank: label + maksimal 4 digit terakhir. Tanpa nomor penuh,
   tanpa kredensial, tanpa akses bank. */
CREATE TABLE IF NOT EXISTS bank_account_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label text NOT NULL,
  bank_label text,
  account_last4 text CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$'),
  cash_account_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_account_aliases_label
  ON bank_account_aliases(workspace_id, lower(label));
CREATE UNIQUE INDEX IF NOT EXISTS bank_account_aliases_ws_id
  ON bank_account_aliases(workspace_id, id);

/* Baris mutasi bank: kolom tambahan (tanggal terpisah, alias, klasifikasi terkonfirmasi). */
ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS bank_alias_id uuid,
  ADD COLUMN IF NOT EXISTS transaction_on date,
  ADD COLUMN IF NOT EXISTS value_on date,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS external_transaction_ref text,
  ADD COLUMN IF NOT EXISTS suggested_class text,
  ADD COLUMN IF NOT EXISTS confirmed_class text,
  ADD COLUMN IF NOT EXISTS classified_by uuid,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz;
CREATE INDEX IF NOT EXISTS bank_statement_lines_ws_alias
  ON bank_statement_lines(workspace_id, bank_alias_id, posted_on DESC);

/* Statement bank: kaitkan ke alias rekening terdaftar (tanpa nomor penuh) */
ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS bank_alias_id uuid;

/* Pencocokan rekonsiliasi: mendukung 1-1, 1-N, N-1, dan parsial. Keputusan SELALU
   dari pengguna (confirmed_by/at); pelepasan menyimpan unmatched_by/at. */
CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  left_kind text NOT NULL,
  left_id uuid NOT NULL,
  right_kind text NOT NULL DEFAULT 'bank_line',
  right_id uuid NOT NULL,
  match_type text NOT NULL DEFAULT 'one_to_one',
  status text NOT NULL DEFAULT 'manual_review',
  matched_amount BIGINT,
  currency text,
  difference BIGINT,
  score integer,
  reason text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  unmatched_by uuid,
  unmatched_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_active
  ON bank_reconciliation_matches(workspace_id, left_kind, left_id, right_kind, right_id)
  WHERE unmatched_at IS NULL;
CREATE INDEX IF NOT EXISTS bank_reconciliation_matches_ws_status
  ON bank_reconciliation_matches(workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_ws_id
  ON bank_reconciliation_matches(workspace_id, id);

/* Tautan pesanan marketplace ke penjualan/invoice internal (tanpa double count). */
CREATE TABLE IF NOT EXISTS marketplace_order_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  link_kind text NOT NULL,
  link_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'linked',
  amount BIGINT,
  currency text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_links_key
  ON marketplace_order_links(workspace_id, order_id, link_kind, link_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_links_ws_id
  ON marketplace_order_links(workspace_id, id);

/* Baris settlement: pertahankan nilai MENTAH sumber di kolom terpisah supaya
   perbaikan pemetaan tidak menimpa data posted. */
ALTER TABLE marketplace_settlement_lines
  ADD COLUMN IF NOT EXISTS settlement_summary_id uuid,
  ADD COLUMN IF NOT EXISTS line_type_raw text,
  ADD COLUMN IF NOT EXISTS gross_sales_amount BIGINT,
  ADD COLUMN IF NOT EXISTS seller_discount_amount BIGINT,
  ADD COLUMN IF NOT EXISTS platform_discount_amount BIGINT,
  ADD COLUMN IF NOT EXISTS refund_amount BIGINT;

/* Header pesanan: simpan nilai mentah sumber + kolom yang dipakai KPI. */
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS order_status_raw text,
  ADD COLUMN IF NOT EXISTS purchase_channel text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS buyer_reference_masked text,
  ADD COLUMN IF NOT EXISTS order_updated_at date;
ALTER TABLE marketplace_orders
  ALTER COLUMN order_updated_at TYPE date USING order_updated_at::date;

/* RLS: ENABLE + FORCE + policy workspace untuk semua tabel baru */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'marketplace_order_items', 'marketplace_settlement_summaries', 'marketplace_external_payment_references',
    'marketplace_sku_mappings', 'bank_account_aliases', 'bank_reconciliation_matches', 'marketplace_order_links'
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

/* FK komposit tenant-aware (kolom tunggal sudah punya FK; ini menambah pasangan tenant) */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_order_items_channel_fk') THEN
    ALTER TABLE marketplace_order_items ADD CONSTRAINT mkt_order_items_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_order_items_batch_fk') THEN
    ALTER TABLE marketplace_order_items ADD CONSTRAINT mkt_order_items_batch_fk
      FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_summaries_channel_fk') THEN
    ALTER TABLE marketplace_settlement_summaries ADD CONSTRAINT mkt_settlement_summaries_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_summaries_batch_fk') THEN
    ALTER TABLE marketplace_settlement_summaries ADD CONSTRAINT mkt_settlement_summaries_batch_fk
      FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_ext_payment_refs_channel_fk') THEN
    ALTER TABLE marketplace_external_payment_references ADD CONSTRAINT mkt_ext_payment_refs_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_ext_payment_refs_summary_fk') THEN
    ALTER TABLE marketplace_external_payment_references ADD CONSTRAINT mkt_ext_payment_refs_summary_fk
      FOREIGN KEY (workspace_id, settlement_summary_id) REFERENCES marketplace_settlement_summaries(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_ext_payment_refs_line_fk') THEN
    ALTER TABLE marketplace_external_payment_references ADD CONSTRAINT mkt_ext_payment_refs_line_fk
      FOREIGN KEY (workspace_id, settlement_line_id) REFERENCES marketplace_settlement_lines(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_sku_mappings_channel_fk') THEN
    ALTER TABLE marketplace_sku_mappings ADD CONSTRAINT mkt_sku_mappings_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_sku_mappings_product_fk') THEN
    ALTER TABLE marketplace_sku_mappings ADD CONSTRAINT mkt_sku_mappings_product_fk
      FOREIGN KEY (workspace_id, product_id) REFERENCES products(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statements_alias_fk') THEN
    ALTER TABLE bank_statements ADD CONSTRAINT bank_statements_alias_fk
      FOREIGN KEY (workspace_id, bank_alias_id) REFERENCES bank_account_aliases(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_lines_alias_fk') THEN
    ALTER TABLE bank_statement_lines ADD CONSTRAINT bank_statement_lines_alias_fk
      FOREIGN KEY (workspace_id, bank_alias_id) REFERENCES bank_account_aliases(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_settlement_lines_summary_fk') THEN
    ALTER TABLE marketplace_settlement_lines ADD CONSTRAINT mkt_settlement_lines_summary_fk
      FOREIGN KEY (workspace_id, settlement_summary_id) REFERENCES marketplace_settlement_summaries(workspace_id, id) ON DELETE SET NULL;
  END IF;
END
$$;

/* Hak akses peran aplikasi (pola sama seperti migrasi 002/003/018) */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  marketplace_order_items, marketplace_settlement_summaries, marketplace_external_payment_references,
  marketplace_sku_mappings, bank_account_aliases, bank_reconciliation_matches, marketplace_order_links
TO bf_app;

COMMENT ON TABLE marketplace_order_items IS 'Catatan rincian item pesanan marketplace hasil impor berkas; tidak mengubah stok/HPP dan tidak menyinkronkan apa pun.';
COMMENT ON TABLE marketplace_settlement_summaries IS 'Catatan ringkasan statement settlement menurut sumber; bukan kas diterima.';
COMMENT ON TABLE bank_reconciliation_matches IS 'Relasi audit pencocokan (1-1, 1-N, N-1, parsial). Tidak mengubah nilai sumber dan tidak memindahkan dana.';
COMMENT ON TABLE bank_account_aliases IS 'Alias rekening (label + maksimal 4 digit terakhir). Tanpa nomor penuh dan tanpa kredensial.';
