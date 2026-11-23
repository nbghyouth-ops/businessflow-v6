-- 024_import_job_file_encoding: penanda encoding isi berkas job.
--
-- Berkas job disimpan terkompresi (gzip) supaya penulisan satu baris `bytea` besar
-- tidak menahan event loop (encoding hex 1,7 MB di JS memakan ratusan milidetik).
-- Dekompresi memakai threadpool Node, bukan event loop. Aditif & idempoten.

ALTER TABLE import_job_files ADD COLUMN IF NOT EXISTS encoding text NOT NULL DEFAULT 'gzip';

COMMENT ON COLUMN import_job_files.encoding IS 'Encoding isi berkas job: gzip (default) atau raw.';
