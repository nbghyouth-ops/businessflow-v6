-- 020_drop_import_fingerprint: pencabutan kolom & indeks sidik jari berkas (R11-A langkah 5).
--
-- Dijalankan HANYA setelah jalur impor generik hijau: kode tidak lagi membaca atau
-- menulis kolom-kolom ini, jadi menghapusnya tidak menghilangkan apa pun yang dipakai.
-- Nama kolom sengaja hanya muncul pada pernyataan DROP (dijaga gerbang G-NOFP).
--
-- Idempoten: setiap pernyataan memakai IF EXISTS.

/* import_batches: hash berkas tidak lagi disimpan (dedupe memakai kunci alami baris) */
DROP INDEX IF EXISTS import_batches_ws_hash;
ALTER TABLE import_batches
  DROP COLUMN IF EXISTS file_hash;

/* bank_statements: hash berkas tidak lagi disimpan */
ALTER TABLE bank_statements
  DROP COLUMN IF EXISTS file_hash;

COMMENT ON COLUMN import_batches.filename IS 'Nama berkas sumber (metadata provenance), BUKAN kunci dedupe.';
