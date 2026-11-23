-- 025: perluas jenis riwayat ekspor untuk ekspor LAPORAN (R11-D §T5).
-- Aditif: nilai lama ('receipt','activity_summary') tetap sah; hanya menambah 'report_export'.
ALTER TABLE export_records DROP CONSTRAINT IF EXISTS export_records_kind_check;
ALTER TABLE export_records DROP CONSTRAINT IF EXISTS export_kind;
ALTER TABLE export_records
  ADD CONSTRAINT export_kind CHECK (kind IN ('receipt', 'activity_summary', 'report_export'));
