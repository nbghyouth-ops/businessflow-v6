-- 009_export_lifecycle.sql — status ekspor nyata: pending → completed | failed (dikonfirmasi setelah file benar-benar dibuat)
ALTER TABLE export_records ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE export_records ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE export_records ADD CONSTRAINT export_status CHECK (status IN ('pending','completed','failed','preview','reversed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Role aplikasi hanya boleh mengubah kolom status siklus hidup (snapshot/riwayat tetap immutable).
GRANT UPDATE (status, error, completed_at) ON export_records TO bf_app;
