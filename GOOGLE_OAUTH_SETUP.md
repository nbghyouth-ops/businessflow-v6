# Panduan Google OAuth (dikerjakan manual oleh pemilik)

Agen tidak dapat menguji login Google asli (Google menolak otomasi); langkah ini wajib dikerjakan pemilik. Ikuti dan centang tiap langkah. Gunakan **project Google Cloud terpisah** untuk dev dan prod.

## 1. Google Cloud
1. console.cloud.google.com → buat project (mis. `business-flow-prod`).
2. **Google Auth Platform / OAuth consent screen**: User type *External*; nama aplikasi **Business Flow**; logo; email dukungan; email kontak developer; homepage; URL Kebijakan Privasi dan Syarat Layanan (halaman publik di domain Anda); *Authorized domains* = domain produksi.
3. **Scopes**: hanya `openid`, `email`, `profile` (non-sensitif, tidak butuh verifikasi khusus).
4. **Publishing status**: *Testing* hanya mengizinkan test user yang Anda daftarkan; ubah ke *In production* agar semua akun Google dapat masuk.
5. **Clients → Create → Web application**:
   - Authorized JavaScript origins: `https://DOMAIN-ANDA` (tanpa path, tanpa `/` di akhir).
   - Authorized redirect URIs: `https://DOMAIN-ANDA/api/auth/callback/google` (persis; skema, host, path).
   - Lokal: origin `http://localhost:3000`, redirect `http://localhost:3000/api/auth/callback/google` (client dev terpisah).
6. Google **tidak menerima wildcard**: URL preview Vercel acak tidak bisa login kecuali Anda membuat client OAuth terpisah per URL. Uji login di domain produksi/tetap.

## 2. Environment Variables (Vercel → Settings → Environment Variables)
| Key | Nilai |
|---|---|
| `DATABASE_URL` | connection string Neon (pooled) |
| `BETTER_AUTH_SECRET` | string acak ≥ 32 karakter (`openssl rand -base64 48`). Jangan pernah diganti sembarangan: semua sesi menjadi tidak valid |
| `BETTER_AUTH_URL` | `https://DOMAIN-ANDA` (tanpa `/` akhir) |
| `GOOGLE_CLIENT_ID` | dari langkah 5 |
| `GOOGLE_CLIENT_SECRET` | dari langkah 5 (rahasia) |
Tanpa semuanya, `/api/health` menjawab `AUTH_NOT_CONFIGURED` dan `/sign-in` menampilkan "belum dikonfigurasi".

## 3. Migrasi database
`DATABASE_URL=... npm run db:migrate` atau tempel `drizzle/ALL_IN_ONE.sql` ke Neon SQL Editor (migrasi 006 menambah tabel identitas).

## 4. Checklist uji nyata (status awal: BLOCKED)
- [ ] `https://DOMAIN/api/health` → `{"ok":true}`
- [ ] `/sign-in` → "Masuk dengan Google" → layar persetujuan Google → kembali ke aplikasi
- [ ] Onboarding membuat workspace; Anda menjadi owner
- [ ] Refresh halaman → sesi bertahan; buka di browser lain → diminta login lagi
- [ ] Keluar → sesi hilang (cookie dan baris `session` terhapus)
- [ ] Akun Google lain (bukan anggota) tidak dapat membuka data workspace Anda
- [ ] Error umum: `redirect_uri_mismatch` ⇒ redirect URI tidak persis; `access_denied` ⇒ akun bukan test user saat status *Testing*; `config_missing` ⇒ ENV belum lengkap.
