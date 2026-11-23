-- 027 (R11-E / R19): DOKUMEN BERNOMOR + PDF SERVER.
-- Dokumen (faktur/penawaran/kuitansi/surat jalan) dicatat sebagai SNAPSHOT tetap setelah terbit
-- (immutable): koreksi hanya lewat dokumen pengganti/void bertanda. Nomor dialokasikan di dalam
-- transaksi yang sama dengan dokumen (doc_counters) sehingga tidak ada lubang walau rollback.
-- Kuitansi = CATATAN bahwa pembayaran diterima di luar aplikasi (tanpa tautan/tombol bayar).
-- Aditif: tidak mengubah tabel lama.

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'quotation', 'receipt', 'delivery_note')),
  number TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id UUID,
  template_key TEXT NOT NULL DEFAULT 'standard',
  template_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'voided')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by_device_id UUID,
  issued_by_operator TEXT,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,
  replaces_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT documents_void_reason_required CHECK (status <> 'voided' OR voided_reason IS NOT NULL),
  UNIQUE (workspace_id, number)
);
CREATE INDEX IF NOT EXISTS documents_ws_kind_issued ON documents (workspace_id, kind, issued_at DESC);
CREATE INDEX IF NOT EXISTS documents_ws_source ON documents (workspace_id, source_kind, source_id);

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'quotation', 'receipt', 'delivery_note')),
  key TEXT NOT NULL DEFAULT 'standard',
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind, key)
);

CREATE TABLE IF NOT EXISTS document_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

-- RLS ENABLE + FORCE + policy tenant untuk tiga tabel baru.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents', 'document_templates', 'document_template_versions'] LOOP
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

GRANT SELECT, INSERT, UPDATE ON TABLE documents TO bf_app;
GRANT SELECT, INSERT, UPDATE ON TABLE document_templates TO bf_app;
GRANT SELECT, INSERT ON TABLE document_template_versions TO bf_app;
