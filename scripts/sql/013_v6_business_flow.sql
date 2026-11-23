-- 013_v6_business_flow.sql
-- Business Flow v6.0 — aditif & idempoten.
--   1) Marketplace multi-kanal (channel, listing, order, settlement)
--   2) Ruang data pribadi (owner-scoped RLS, TERPISAH dari workspace/bisnis — R4)
--   3) Jembatan pemilik ↔ bisnis (pemetaan eksplisit + catatan posting)
--   4) Etalase publik + permintaan masuk
--   5) RFQ (permintaan penawaran) + kutipan
--   6) Progres pembelajaran
-- Uang = NUMERIC(18,2); kuantitas = NUMERIC(18,3). Tidak ada kolom float.

/* ───────────── Marketplace ───────────── */
CREATE TABLE IF NOT EXISTS marketplace_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'manual', -- shopee | tokopedia | tiktok | manual
  fee_percent numeric(5,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_channels_fee CHECK (fee_percent >= 0 AND fee_percent <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_channels_ws_name ON marketplace_channels(workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_sku text,
  price numeric(18,2) NOT NULL DEFAULT 0,
  stock_buffer numeric(18,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active', -- active | paused | ended
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_listings_price CHECK (price >= 0),
  CONSTRAINT marketplace_listings_buffer CHECK (stock_buffer >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_channel_sku
  ON marketplace_listings(workspace_id, channel_id, coalesce(external_sku, ''));

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  occurred_on date NOT NULL,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount numeric(18,2) NOT NULL DEFAULT 0,
  platform_fee numeric(18,2) NOT NULL DEFAULT 0,
  shipping_cost numeric(18,2) NOT NULL DEFAULT 0,
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid', -- pending | paid | shipped | settled | cancelled
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_orders_amounts CHECK (
    gross_amount >= 0 AND discount >= 0 AND platform_fee >= 0 AND shipping_cost >= 0 AND net_amount >= 0
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_channel_no ON marketplace_orders(workspace_id, channel_id, order_no);
CREATE INDEX IF NOT EXISTS marketplace_orders_ws_date ON marketplace_orders(workspace_id, occurred_on);

CREATE TABLE IF NOT EXISTS marketplace_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  fee_amount numeric(18,2) NOT NULL DEFAULT 0,
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'recorded', -- recorded | received
  received_on date,
  journal_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_settlements_amounts CHECK (gross_amount >= 0 AND fee_amount >= 0 AND net_amount >= 0),
  CONSTRAINT marketplace_settlements_period CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS marketplace_settlements_ws ON marketplace_settlements(workspace_id, period_end);

/* ───────────── Ruang pribadi (owner-scoped; TIDAK memakai workspace_id) ───────────── */
CREATE TABLE IF NOT EXISTS personal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cash', -- cash | bank | ewallet | other
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_accounts_owner_name ON personal_accounts(owner_id, lower(name));

CREATE TABLE IF NOT EXISTS personal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES personal_accounts(id) ON DELETE CASCADE,
  to_account_id uuid REFERENCES personal_accounts(id) ON DELETE SET NULL,
  type text NOT NULL, -- income | expense | transfer
  amount numeric(18,2) NOT NULL,
  category text,
  occurred_on date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_transactions_amount CHECK (amount > 0),
  CONSTRAINT personal_transactions_transfer CHECK (type <> 'transfer' OR (to_account_id IS NOT NULL AND to_account_id <> account_id))
);
CREATE INDEX IF NOT EXISTS personal_transactions_owner_date ON personal_transactions(owner_id, occurred_on);

CREATE TABLE IF NOT EXISTS personal_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  month text NOT NULL, -- YYYY-MM
  category text NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_budgets_amount CHECK (amount >= 0),
  CONSTRAINT personal_budgets_month CHECK (month ~ '^\d{4}-\d{2}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_budgets_owner_month_cat ON personal_budgets(owner_id, month, category);

CREATE TABLE IF NOT EXISTS personal_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  name text NOT NULL,
  target_amount numeric(18,2) NOT NULL,
  saved_amount numeric(18,2) NOT NULL DEFAULT 0,
  target_date date,
  status text NOT NULL DEFAULT 'active', -- active | achieved | cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_goals_amount CHECK (target_amount > 0 AND saved_amount >= 0)
);

/* ───────────── Jembatan pemilik ↔ bisnis ───────────── */
CREATE TABLE IF NOT EXISTS bridge_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  label text NOT NULL,
  direction text NOT NULL, -- personal_to_business | business_to_owner
  personal_category text,
  cash_account_id uuid NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  coa_account_id uuid NOT NULL REFERENCES coa_accounts(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bridge_mappings_owner_label ON bridge_mappings(workspace_id, owner_id, lower(label));

CREATE TABLE IF NOT EXISTS bridge_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  mapping_id uuid NOT NULL REFERENCES bridge_mappings(id) ON DELETE CASCADE,
  personal_transaction_id uuid REFERENCES personal_transactions(id) ON DELETE SET NULL,
  finance_transaction_id uuid,
  amount numeric(18,2) NOT NULL,
  posted_on date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_postings_amount CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS bridge_postings_ws ON bridge_postings(workspace_id, posted_on);

/* ───────────── Etalase publik ───────────── */
CREATE TABLE IF NOT EXISTS storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  tagline text,
  about text,
  contact_phone text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefronts_slug ON storefronts(lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS storefronts_ws ON storefronts(workspace_id);

CREATE TABLE IF NOT EXISTS storefront_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  storefront_id uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  contact text NOT NULL,
  message text,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity numeric(18,3),
  status text NOT NULL DEFAULT 'new', -- new | handled
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storefront_inquiries_ws ON storefront_inquiries(workspace_id, created_at);

/* ───────────── RFQ (permintaan penawaran) ───────────── */
CREATE TABLE IF NOT EXISTS rfq_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  number text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  due_date date,
  status text NOT NULL DEFAULT 'open', -- open | quoted | accepted | closed | cancelled
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rfq_requests_ws_number ON rfq_requests(workspace_id, number);

CREATE TABLE IF NOT EXISTS rfq_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES rfq_requests(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL,
  valid_until date,
  note text,
  status text NOT NULL DEFAULT 'sent', -- sent | accepted | rejected
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfq_quotes_amount CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS rfq_quotes_rfq ON rfq_quotes(rfq_id);

/* ───────────── Pembelajaran ───────────── */
CREATE TABLE IF NOT EXISTS learning_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_ref text NOT NULL,
  lesson_key text NOT NULL,
  status text NOT NULL DEFAULT 'started', -- started | completed
  score integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_progress_unique ON learning_progress(workspace_id, user_ref, lesson_key);

/* ───────────── RLS: tabel bertenant (ENABLE + FORCE + policy workspace) ───────────── */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'marketplace_channels', 'marketplace_listings', 'marketplace_orders', 'marketplace_settlements',
    'bridge_mappings', 'bridge_postings', 'storefronts', 'storefront_inquiries',
    'rfq_requests', 'rfq_quotes', 'learning_progress'
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

/* Ruang pribadi: isolasi per pemilik (bukan per workspace). Fail-closed bila app.owner_id kosong. */
DO $$
DECLARE
  t text;
  owner_tables text[] := ARRAY['personal_accounts', 'personal_transactions', 'personal_budgets', 'personal_goals'];
BEGIN
  FOREACH t IN ARRAY owner_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY owner_isolation ON %I USING (owner_id = NULLIF(current_setting(''app.owner_id'', true), '''')) WITH CHECK (owner_id = NULLIF(current_setting(''app.owner_id'', true), ''''))',
      t
    );
  END LOOP;
END
$$;

/* Kunci unik komposit (workspace_id, id) untuk FK tenant-aware. */
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_channels_ws_id ON marketplace_channels(workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS rfq_requests_ws_id ON rfq_requests(workspace_id, id);

/* FK komposit tenant-aware untuk tabel baru yang mereferensikan entitas bertenant. */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_listings_channel_fk') THEN
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT marketplace_listings_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_orders_channel_fk') THEN
    ALTER TABLE marketplace_orders
      ADD CONSTRAINT marketplace_orders_channel_fk
      FOREIGN KEY (workspace_id, channel_id) REFERENCES marketplace_channels(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rfq_quotes_rfq_fk') THEN
    ALTER TABLE rfq_quotes
      ADD CONSTRAINT rfq_quotes_rfq_fk
      FOREIGN KEY (workspace_id, rfq_id) REFERENCES rfq_requests(workspace_id, id) ON DELETE CASCADE;
  END IF;
END
$$;

/* Hak akses role aplikasi. Personal space tetap dapat diakses bf_app, tetapi RLS pemilik yang menentukan. */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  marketplace_channels, marketplace_listings, marketplace_orders, marketplace_settlements,
  personal_accounts, personal_transactions, personal_budgets, personal_goals,
  bridge_mappings, bridge_postings, storefronts, storefront_inquiries,
  rfq_requests, rfq_quotes, learning_progress
TO bf_app;

/* Catatan append-only: posting jembatan tidak boleh diubah/dihapus setelah tercatat. */
REVOKE UPDATE, DELETE ON TABLE bridge_postings FROM bf_app;
