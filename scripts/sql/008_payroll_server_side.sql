-- 008_payroll_server_side.sql — payroll dihitung server, bertahap draft → posted (jurnal) → reversed
ALTER TABLE payroll_runs ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS policy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS journal_entry_id uuid;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS reversal_entry_id uuid;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS created_by text;
DO $$ BEGIN
  ALTER TABLE payroll_runs ADD CONSTRAINT payroll_status CHECK (status IN ('draft','posted','reversed','cancelled','legacy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- run lama (diisi manual dari klien) ditandai legacy agar tidak dianggap hasil hitung server
UPDATE payroll_runs SET status = 'legacy' WHERE status = 'posted' AND journal_entry_id IS NULL AND posted_at IS NULL;
-- satu run aktif per periode (draft/posted); aman bila data lama bentrok
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_period_active ON payroll_runs (workspace_id, period_month) WHERE status IN ('draft','posted');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'uq_payroll_period_active dilewati: %', SQLERRM; END $$;
