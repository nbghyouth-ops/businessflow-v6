-- 026 (R11-E): voucher/loyalitas (CATATAN DISKON, bukan pembayaran), pusat aturan
-- workspace, dan penegasan RLS untuk direktori supplier yang sudah ada.
-- Aditif: tidak mengubah tabel lama.

CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
  percent_bp INTEGER CHECK (percent_bp IS NULL OR (percent_bp > 0 AND percent_bp <= 10000)),
  amount NUMERIC(18,2) CHECK (amount IS NULL OR amount > 0),
  min_purchase NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  max_discount NUMERIC(18,2) CHECK (max_discount IS NULL OR max_discount > 0),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  quota INTEGER CHECK (quota IS NULL OR quota > 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT vouchers_value_matches_kind CHECK (
    (kind = 'percent' AND percent_bp IS NOT NULL AND amount IS NULL) OR
    (kind = 'amount' AND amount IS NOT NULL AND percent_bp IS NULL)
  ),
  CONSTRAINT vouchers_period_valid CHECK (valid_to >= valid_from),
  CONSTRAINT vouchers_quota_not_exceeded CHECK (quota IS NULL OR used <= quota),
  UNIQUE (workspace_id, code)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_ws_active ON vouchers (workspace_id, is_active, valid_to);

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount_before NUMERIC(18,2) NOT NULL,
  discount_amount NUMERIC(18,2) NOT NULL CHECK (discount_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_ws ON voucher_redemptions (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_rules (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  forecast_default_weeks INTEGER NOT NULL DEFAULT 13 CHECK (forecast_default_weeks BETWEEN 1 AND 52),
  low_stock_threshold NUMERIC(18,3) NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  invoice_due_days INTEGER NOT NULL DEFAULT 14 CHECK (invoice_due_days BETWEEN 1 AND 365),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- RLS ENABLE + FORCE + policy tenant untuk tiga tabel baru.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vouchers', 'voucher_redemptions', 'workspace_rules'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vouchers, voucher_redemptions, workspace_rules TO bf_app;

-- Direktori supplier sudah ada tabelnya; GRANT dipastikan untuk peran aplikasi.
GRANT SELECT, INSERT, UPDATE ON TABLE suppliers TO bf_app;
