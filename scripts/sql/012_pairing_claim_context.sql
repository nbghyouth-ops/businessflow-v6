-- 012_pairing_claim_context.sql
-- Klaim kode pairing berjalan TANPA sesi dan TANPA konteks tenant (POST /api/v1/device/pair),
-- sementara pairing_codes memakai ENABLE + FORCE ROW LEVEL SECURITY. Akibatnya klaim selalu
-- gagal: UPDATE tidak mengenai baris apa pun (0 rows) sehingga kode valid ditolak selamanya.
--
-- Perbaikan tanpa melemahkan isolasi: policy tambahan (permissive, di-OR dengan tenant_isolation)
-- yang hanya membuka SATU baris dengan hash kode yang dipegang pemanggil. Hash 8 karakter acak
-- bersifat rahasia, sekali pakai, berumur 10 menit, dan laju pembuatan/penebusan sudah dibatasi.

DROP POLICY IF EXISTS pairing_claim_select ON pairing_codes;
CREATE POLICY pairing_claim_select ON pairing_codes FOR SELECT
  USING (
    code_hash = NULLIF(current_setting('app.pairing_code', true), '')
    AND used_at IS NULL
  );

DROP POLICY IF EXISTS pairing_claim_update ON pairing_codes;
CREATE POLICY pairing_claim_update ON pairing_codes FOR UPDATE
  USING (
    code_hash = NULLIF(current_setting('app.pairing_code', true), '')
    AND used_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (code_hash = NULLIF(current_setting('app.pairing_code', true), ''));
