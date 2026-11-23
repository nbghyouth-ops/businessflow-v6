-- 023_import_job_totals: total per mata uang yang sudah tercatat pada potongan-potongan
-- sebelumnya. Tanpa kolom ini, job commit yang dilanjutkan setelah proses mati akan
-- melaporkan total mata uang yang kurang (padahal barisnya sudah tersimpan).
-- Aditif & idempoten.

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS totals jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN import_jobs.totals IS 'Total unit minor per mata uang dari potongan yang sudah diproses (dipakai saat job dilanjutkan).';
