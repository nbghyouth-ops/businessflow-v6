-- 017_nopay_record_only: menegakkan aturan PENCATATAN MURNI (prompt R7-C §1).
--
-- Aplikasi tidak menyimpan kunci/token pihak ketiga dan tidak menyambung ke API
-- marketplace/bank (larangan L1–L7). Dua hal yang dibuat oleh versi sebelumnya
-- sekarang dimatikan:
--   1. kolom kredensial kanal (dibuat migrasi 016) — dihapus;
--   2. tabel storefront_inquiries (dibuat migrasi 013) — etalase menjadi katalog
--      informasi baca-saja tanpa kotak masuk permintaan pembeli (revisi F-08).
--
-- Additif + idempoten; migrasi lama tidak diubah (checksum terjaga).

ALTER TABLE marketplace_channels
  DROP COLUMN IF EXISTS credential_enc,
  DROP COLUMN IF EXISTS credential_hint,
  DROP COLUMN IF EXISTS credential_updated_at;

DROP TABLE IF EXISTS storefront_inquiries;

-- Nilai jenis akun kas "ewallet" tidak lagi dipakai (kosakata terkunci: dompet/wallet).
UPDATE cash_accounts SET kind = 'digital' WHERE kind = 'ewallet';

COMMENT ON TABLE marketplace_channels IS 'Label kanal penjualan untuk data tercatat; tanpa kredensial, tanpa penyambungan, tanpa transaksi.';
