-- 019_import_mapping_profiles: Mapping Profiles berversi + provenance impor generik (R11-A).
--
-- ADDITIF saja. Tidak ada DROP di sini (pencabutan kolom sidik jari ada di migrasi
-- terpisah 020 yang dijalankan hanya setelah jalur baru hijau).
--
-- Profil = pemetaan kolom yang DIKONFIRMASI pengguna, per workspace. Versi immutable:
-- perubahan menghasilkan baris versi baru, dan batch merekam versi yang dipakai.

/* ── Kolom provenance pada batch impor ── */
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS provider_code TEXT,
  ADD COLUMN IF NOT EXISTS report_type TEXT,
  ADD COLUMN IF NOT EXISTS row_grain TEXT,
  ADD COLUMN IF NOT EXISTS source_label_id uuid,
  ADD COLUMN IF NOT EXISTS mapping_profile_id uuid,
  ADD COLUMN IF NOT EXISTS mapping_profile_version INTEGER,
  ADD COLUMN IF NOT EXISTS user_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sheet_name TEXT,
  ADD COLUMN IF NOT EXISTS header_row INTEGER;

CREATE INDEX IF NOT EXISTS import_batches_ws_report ON import_batches(workspace_id, report_type, created_at DESC);

/* ── Profil pemetaan (kepala) ── */
CREATE TABLE IF NOT EXISTS import_mapping_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,               -- marketplace | bank
  report_type TEXT NOT NULL,
  provider_code TEXT,                 -- konteks sumber; boleh kosong
  source_label TEXT,                  -- toko/alias rekening (teks label, tanpa kredensial)
  file_format TEXT NOT NULL DEFAULT 'any', -- csv | xlsx | any
  status TEXT NOT NULL DEFAULT 'USER_CONFIRMED', -- DRAFT | USER_CONFIRMED | NEEDS_UPDATE | DISABLED
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profiles_ws_name
  ON import_mapping_profiles(workspace_id, lower(name)) WHERE status <> 'DISABLED';
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profiles_ws_id
  ON import_mapping_profiles(workspace_id, id);

/* ── Versi profil (IMMUTABLE: tidak pernah diubah di tempat) ── */
CREATE TABLE IF NOT EXISTS import_mapping_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  version INTEGER NOT NULL,
  sheet_name TEXT,
  header_row INTEGER NOT NULL DEFAULT 0,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,   -- field kanonik → nama header sumber
  parsing JSONB NOT NULL DEFAULT '{}'::jsonb,   -- opsi parsing yang dikonfirmasi pengguna
  created_by UUID,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profile_versions_unique
  ON import_mapping_profile_versions(workspace_id, profile_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_profile_versions_ws_id
  ON import_mapping_profile_versions(workspace_id, id);
CREATE INDEX IF NOT EXISTS import_mapping_profile_versions_profile
  ON import_mapping_profile_versions(workspace_id, profile_id, version DESC);

/* ── RLS: ENABLE + FORCE + policy workspace (pola migrasi 002/018) ── */
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY['import_mapping_profiles', 'import_mapping_profile_versions'];
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

/* ── FK komposit tenant-aware + FK batch → profil ── */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_mapping_profile_versions_profile_fk') THEN
    ALTER TABLE import_mapping_profile_versions ADD CONSTRAINT import_mapping_profile_versions_profile_fk
      FOREIGN KEY (workspace_id, profile_id) REFERENCES import_mapping_profiles(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_batches_mapping_profile_fk') THEN
    ALTER TABLE import_batches ADD CONSTRAINT import_batches_mapping_profile_fk
      FOREIGN KEY (workspace_id, mapping_profile_id) REFERENCES import_mapping_profiles(workspace_id, id) ON DELETE SET NULL;
  END IF;
END
$$;

/* ── Hak akses peran aplikasi (bug R7-C: tabel baru tanpa GRANT) ── */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_mapping_profiles, import_mapping_profile_versions TO bf_app;

COMMENT ON TABLE import_mapping_profiles IS 'Profil pemetaan kolom per workspace: dibuat dari pemetaan yang dikonfirmasi pengguna, berversi immutable, TIDAK memakai sidik jari.';
COMMENT ON TABLE import_mapping_profile_versions IS 'Versi immutable pemetaan (sheet, baris header, mapping, opsi parsing). Batch merekam versi yang dipakai.';
