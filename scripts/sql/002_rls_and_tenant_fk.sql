-- 002_rls_and_tenant_fk.sql
-- Row Level Security (fail-closed) + role runtime bf_app (NOBYPASSRLS) + composite tenant FKs

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bf_app') THEN
    CREATE ROLE bf_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- Izinkan user koneksi saat ini melakukan SET LOCAL ROLE bf_app dalam transaksi
DO $$
BEGIN
  EXECUTE format('GRANT bf_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO bf_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bf_app;

-- Hak akses minimum pada tabel-tabel yang ada
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bf_app;

-- Tabel append-only: cabut UPDATE & DELETE dari role aplikasi
REVOKE UPDATE, DELETE ON TABLE journal_entries, journal_lines, stock_movements, audit_events FROM bf_app;

-- Daftar tabel bertenant yang wajib ENABLE + FORCE ROW LEVEL SECURITY
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'businesses', 'branches', 'warehouses', 'device_grants', 'pairing_codes',
    'legal_acceptances', 'audit_events', 'idempotency_keys', 'doc_counters',
    'notifications', 'coa_accounts', 'cash_accounts', 'finance_categories',
    'accounting_periods', 'journal_entries', 'journal_lines', 'finance_transactions',
    'budgets', 'clients', 'client_contacts', 'client_activities', 'products',
    'stock_movements', 'invoices', 'invoice_lines', 'payments', 'suppliers',
    'purchase_orders', 'purchase_order_lines', 'supplier_bills', 'employees',
    'attendance', 'tasks', 'projects', 'assets', 'campaigns', 'ops_logs',
    'cash_sessions', 'booking_resources', 'bookings'
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

-- Composite unique (workspace_id, id) untuk composite FK lintas-tabel yang tenant-aware
DO $$
BEGIN
  ALTER TABLE clients ADD CONSTRAINT uq_clients_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE products ADD CONSTRAINT uq_products_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE invoices ADD CONSTRAINT uq_invoices_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE coa_accounts ADD CONSTRAINT uq_coa_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE journal_entries ADD CONSTRAINT uq_je_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE suppliers ADD CONSTRAINT uq_suppliers_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE purchase_orders ADD CONSTRAINT uq_po_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE booking_resources ADD CONSTRAINT uq_bres_ws_id UNIQUE (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Composite FK tenant-aware
DO $$
BEGIN
  ALTER TABLE invoice_lines ADD CONSTRAINT fk_inv_lines_ws_inv FOREIGN KEY (workspace_id, invoice_id) REFERENCES invoices (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE journal_lines ADD CONSTRAINT fk_jl_ws_je FOREIGN KEY (workspace_id, entry_id) REFERENCES journal_entries (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE journal_lines ADD CONSTRAINT fk_jl_ws_coa FOREIGN KEY (workspace_id, account_id) REFERENCES coa_accounts (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE client_contacts ADD CONSTRAINT fk_cc_ws_client FOREIGN KEY (workspace_id, client_id) REFERENCES clients (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE client_activities ADD CONSTRAINT fk_ca_ws_client FOREIGN KEY (workspace_id, client_id) REFERENCES clients (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE purchase_order_lines ADD CONSTRAINT fk_pol_ws_po FOREIGN KEY (workspace_id, po_id) REFERENCES purchase_orders (workspace_id, id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE bookings ADD CONSTRAINT fk_bk_ws_res FOREIGN KEY (workspace_id, resource_id) REFERENCES booking_resources (workspace_id, id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
