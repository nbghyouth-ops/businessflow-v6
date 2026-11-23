-- 004_prd_157_modules.sql — Tabel pendukung 10 paket kemampuan PRD (157 Fitur)
-- Idempotent & RLS-enabled untuk auto-migrate via ensureSchemaMigrated()

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  device_id uuid,
  operator text,
  opening_cash bigint NOT NULL DEFAULT 0,
  cash_in bigint NOT NULL DEFAULT 0,
  cash_out bigint NOT NULL DEFAULT 0,
  cash_sales bigint NOT NULL DEFAULT 0,
  cash_refunds bigint NOT NULL DEFAULT 0,
  expected_cash bigint NOT NULL DEFAULT 0,
  counted_cash bigint,
  variance bigint,
  status text NOT NULL DEFAULT 'open',
  note text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS pos_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'available',
  active_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  warehouse_id uuid,
  batch_no text NOT NULL,
  serial_no text,
  qty_milli bigint NOT NULL DEFAULT 0,
  expiry_date date,
  cost_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_waste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  warehouse_id uuid,
  qty_milli bigint NOT NULL DEFAULT 0,
  reason text NOT NULL,
  cost_cents bigint NOT NULL DEFAULT 0,
  operator text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid,
  version int NOT NULL DEFAULT 1,
  name text NOT NULL,
  yield_qty numeric(18,3) NOT NULL DEFAULT 1,
  yield_unit text NOT NULL DEFAULT 'pcs',
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  number text NOT NULL,
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  product_id uuid,
  planned_qty numeric(18,3) NOT NULL DEFAULT 1,
  actual_qty numeric(18,3) NOT NULL DEFAULT 0,
  waste_qty numeric(18,3) NOT NULL DEFAULT 0,
  labor_cost_cents bigint NOT NULL DEFAULT 0,
  overhead_cost_cents bigint NOT NULL DEFAULT 0,
  total_cost_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Peralatan',
  location text,
  responsible text,
  acquisition_date date NOT NULL DEFAULT CURRENT_DATE,
  acquisition_cost_cents bigint NOT NULL DEFAULT 0,
  residual_value_cents bigint NOT NULL DEFAULT 0,
  useful_life_months int NOT NULL DEFAULT 36,
  method text NOT NULL DEFAULT 'straight_line',
  accumulated_dep_cents bigint NOT NULL DEFAULT 0,
  book_value_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_depreciation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_month text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  book_value_after_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  basis text NOT NULL DEFAULT 'product',
  rate_percent numeric(6,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  standard_cost_cents bigint NOT NULL DEFAULT 0,
  labor_cost_cents bigint NOT NULL DEFAULT 0,
  material_cost_cents bigint NOT NULL DEFAULT 0,
  equipment_cost_cents bigint NOT NULL DEFAULT 0,
  facility_cost_cents bigint NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  wait_minutes int NOT NULL DEFAULT 0,
  process_minutes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operational_displays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ticket_no text NOT NULL,
  station text NOT NULL DEFAULT 'kitchen',
  title text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'cashier_shifts', 'pos_tables', 'product_batches', 'stock_waste',
    'recipes', 'work_orders', 'fixed_assets', 'asset_depreciation_logs',
    'commission_rules', 'service_costs', 'operational_displays'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid)',
      tbl
    );
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO bf_app', tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
