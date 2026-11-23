-- 007_depreciation_journal.sql — depresiasi aset mem-post jurnal; koreksi via jurnal balik
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS journal_entry_id uuid;
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS reversal_entry_id uuid;
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';
ALTER TABLE asset_depreciation_logs ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
DO $$ BEGIN
  ALTER TABLE asset_depreciation_logs ADD CONSTRAINT adl_status CHECK (status IN ('posted','reversed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- unik hanya untuk yang masih berlaku: periode yang dibalik dapat diposting ulang
DROP INDEX IF EXISTS uq_asset_dep_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_dep_period_posted
  ON asset_depreciation_logs (workspace_id, asset_id, period_month) WHERE status = 'posted';
