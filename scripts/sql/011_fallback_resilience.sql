-- 011_fallback_resilience.sql
-- Fondasi sistem FALLBACK (tanpa ENV baru).
-- Semua tabel di sini NON-TENANT dan HANYA diakses role pemilik (server).
-- Tidak ada kolom workspace_id (sengaja) sehingga tidak masuk inventaris RLS bertenant;
-- rujukan workspace memakai kolom workspace_ref tanpa foreign key.
-- Tabel-tabel ini TIDAK diberikan akses ke role aplikasi bf_app (defense in depth).

-- Secret aplikasi hasil pembangkitan (F-02). Nilai tidak pernah dikirim ke klien/log.
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE app_secrets FROM bf_app;

-- Saklar sistem (F-01/F-15). Baris fallbacks_enabled default true.
CREATE TABLE IF NOT EXISTS system_flags (
  key TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO system_flags (key, value) VALUES ('fallbacks_enabled', TRUE)
  ON CONFLICT (key) DO NOTHING;
REVOKE ALL ON TABLE system_flags FROM bf_app;

-- Catatan aktivasi fallback (F-16). Tanpa PII/secret.
CREATE TABLE IF NOT EXISTS fallback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_ref UUID,
  fallback_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_fallback_events_created ON fallback_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fallback_events_fallback ON fallback_events (fallback_id, created_at DESC);
REVOKE ALL ON TABLE fallback_events FROM bf_app;

-- Sesi darurat perangkat (F-06 / 4.5.2). Hash token, maksimum 8 jam, tidak dapat diperpanjang.
CREATE TABLE IF NOT EXISTS emergency_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  device_id UUID NOT NULL,
  workspace_ref UUID NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_emergency_sessions_device ON emergency_sessions (device_id, created_at DESC);
REVOKE ALL ON TABLE emergency_sessions FROM bf_app;

-- Metadata auth workspace (4.5.1). Default google supaya perilaku lama tidak berubah.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'google';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS emergency_login_enabled BOOLEAN NOT NULL DEFAULT TRUE;
DO $$ BEGIN
  ALTER TABLE workspaces ADD CONSTRAINT workspaces_auth_mode_check CHECK (auth_mode IN ('google','device'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sinkronisasi onboarding draft lintas perangkat: ikat ke user_id (bukan hanya device).
ALTER TABLE onboarding_drafts ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_onboarding_drafts_user ON onboarding_drafts (user_id) WHERE user_id IS NOT NULL;

-- Tandai audit yang berasal dari sesi darurat (4.5.2).
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS via_emergency BOOLEAN NOT NULL DEFAULT FALSE;
