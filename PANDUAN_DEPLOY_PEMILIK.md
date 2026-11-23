# PANDUAN DEPLOY — Business Flow (Vercel + Neon + Google OAuth)

Waktu: ±30 menit. Semua langkah di bawah dikerjakan **oleh Anda** (agen tidak memegang kredensial).
Dokumen ini sudah disinkronkan dengan kode rilis R2 (19 November 2026); angka di dalamnya berasal
dari pengujian nyata, bukan perkiraan.

## 0. Berkas yang Anda punya

| Berkas | Isi | Pakai untuk |
|---|---|---|
| `business-flow-github-vercel.zip` | kode produksi (tanpa `tests/`, `docs/`, konfigurasi QA) + `MANIFEST.md` + `SHA256SUMS.txt` | **upload ke GitHub → deploy Vercel** |
| `business-flow-dev-qa.zip` | `tests/`, `docs/`, laporan QA, konfigurasi QA | pengembangan & QA (ditumpuk di akar yang sama) |
| `business-flow-opsional.zip` | `android/`, `capacitor.config.ts`, `functions/` | build APK & dispatcher Neon (opsional) |
| `LAPORAN_AKHIR.md`, `LAPORAN_AUDIT_AWAL.md`, `LAPORAN_TES_KEKACAUAN.md`, `TEST_EVIDENCE.md` | status & bukti | review |

Ekstrak ZIP inti; di dalamnya ada folder `business-flow/`. Itulah akar repo.

## 1. Neon (database)

1. Buat project Neon, region **Singapore (`sin1`)** agar dekat Vercel `sin1`.
2. Salin **connection string pooled** (host berakhiran `-pooler`) → ini `DATABASE_URL`.
   **Selalu tambahkan `sslmode=verify-full`** secara eksplisit, misalnya:
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full
   ```
   Tanpa itu driver `pg` mencetak peringatan mode SSL longgar. Jangan memakai `sslmode=require`.
3. **Migrasi dijalankan EKSPLISIT, bukan otomatis.** Sejak perbaikan BF-003, jalur request tidak
   pernah menjalankan DDL: server hanya memeriksa `schema_migrations` lalu menolak dengan
   `503 schema_not_ready` bila tertinggal. Jadi setelah `npm ci`:
   ```bash
   DATABASE_URL="postgres://...?sslmode=verify-full" npm run db:migrate   # 14 migrasi, idempoten
   DATABASE_URL="postgres://...?sslmode=verify-full" npm run db:check
   ```
   Migrasi aman dijalankan dua kali (idempoten) dan memakai advisory lock bila dua proses berjalan
   bersamaan. Untuk sekali jalan tanpa runner, gunakan `drizzle/ALL_IN_ONE.sql`.
4. `db:check` yang lulus pada rilis ini melaporkan: **106 tabel** di skema `public`,
   **86 tabel bertenant** dengan `ENABLE + FORCE ROW LEVEL SECURITY` (total 90 tabel ber-RLS,
   93 policy), 3 trigger integritas, dan role `bf_app` aman (NOLOGIN, NOBYPASSRLS).
   Angka 91/75 pada panduan versi lama sudah tidak berlaku.

### 1a. Role runtime (penting untuk RLS)

Migrasi membuat role `bf_app`:

```sql
CREATE ROLE bf_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT bf_app TO <user_koneksi_anda>;   -- dilakukan otomatis oleh migrasi 002
```

Setiap transaksi bertenant menjalankan `SET LOCAL ROLE bf_app` + `set_config('app.workspace_id', …, true)`,
jadi seluruh query tenant dieksekusi sebagai role non-bypass, dan tanpa konteks workspace hasilnya
**nol baris** (fail-closed; diuji di `tests/integration/rls.test.ts` dan `auth-rls.test.ts`).

Praktik terbaik produksi (sesuai PRD v6 K4): pakai **role login non-bypass** khusus aplikasi,
jangan pakai role pemilik skema untuk koneksi runtime. Buat sekali di Neon SQL Editor:

```sql
CREATE ROLE bf_runtime LOGIN PASSWORD '<password-kuat>' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT bf_app TO bf_runtime;
GRANT CONNECT ON DATABASE neondb TO bf_runtime;
```
lalu pakai `bf_runtime` pada `DATABASE_URL` produksi. Role pemilik skema hanya dipakai untuk
`npm run db:migrate`. Pembuatan role memerlukan hak `CREATEROLE`; pada Neon role project owner
memilikinya. Bila Anda membiarkan `DATABASE_URL` memakai role pemilik, isolasi tetap berlaku karena
setiap query tenant tetap dijalankan sebagai `bf_app`, tetapi role login tersebut masih dapat
melewati RLS bila dipakai di luar jalur aplikasi — karena itu pemisahan role dianjurkan.

## 2. Google OAuth (login nyata)

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: tipe External, isi nama
   aplikasi, email dukungan, domain. Tambahkan scope **`openid`, `email`, `profile`** saja —
   tanpa Gmail/Drive/Calendar.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorized JavaScript origins:
   ```
   https://<domain-anda>
   ```
4. Authorized redirect URIs (harus **persis**, tanpa garis miring di akhir):
   ```
   https://<domain-anda>/api/auth/callback/google
   ```
   `BETTER_AUTH_URL` **wajib** sama dengan `https://<domain-anda>` (tanpa slash di akhir).
   Bila berbeda, callback ditolak.
5. Salin Client ID & Client Secret ke Vercel (langkah 3). Jangan menaruhnya di berkas repo.
   Detail tambahan: `GOOGLE_OAUTH_SETUP.md`.

## 3. Vercel

1. Import repo GitHub. Framework terdeteksi Next.js. **Node.js Version: 22.x** (atau lebih baru;
   `package.json` mensyaratkan `>=22`). Jangan memakai Node 20.
2. `vercel.json` hanya berisi `regions: ["sin1"]` dan **tanpa `crons`** — jangan menambahkan cron.
3. Environment Variables (Production **dan** Preview), **hanya lima** yang wajib:

   | Nama | Nilai |
   |---|---|
   | `DATABASE_URL` | connection string Neon + `?sslmode=verify-full` |
   | `BETTER_AUTH_SECRET` | ≥ 32 karakter acak (`openssl rand -base64 48`) |
   | `BETTER_AUTH_URL` | `https://<domain-anda>` |
   | `GOOGLE_CLIENT_ID` | dari Google Cloud |
   | `GOOGLE_CLIENT_SECRET` | dari Google Cloud |

   Opsional (hanya build Android): `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`,
   `CAP_SERVER_URL`. **Jangan menambah variabel lain** (aturan ENV terkunci). `NODE_ENV`/`VERCEL_*`
   dibaca otomatis oleh platform.
4. Build command `npm run build`, install `npm ci`. Build **lulus tanpa satu pun ENV** (diuji),
   jadi kegagalan build tidak pernah disebabkan ENV yang belum diisi.
5. **Matikan Vercel Authentication / Deployment Protection untuk Production**, kalau tidak client
   akan melihat halaman login Vercel, bukan aplikasi.
6. Deploy. Setelah selesai, jalankan migrasi sekali dari mesin Anda (Neon bisa diakses dari luar):
   ```bash
   DATABASE_URL="postgres://...?sslmode=verify-full" npm run db:migrate
   ```
7. Buka `https://<domain-anda>/api/health` → harus `200` dengan
   `{"ok":true,"checks":{"database":"ok","schema":"ok","auth":"google",...}}` dan `Cache-Control: no-store`.
   Bila `schema: not_ready` → jalankan migrasi (langkah 6).

### Lisensi hosting (keputusan D-05)

Vercel **Hobby hanya untuk pemakaian nonkomersial**. Pemakaian komersial untuk client memerlukan
Vercel **Pro** atau hosting setara (mis. self-host Node 22 + Neon). Ini keputusan komersial Anda,
bukan pengaturan teknis.

## 4. Setelah deploy — uji manual (10 menit)

Ikuti `UAT_MANUAL.md`. Ringkasnya:

1. Buka `/` → landing tampil; tombol Google membuka consent screen asli (bukan simulasi).
2. Login → onboarding 17 langkah → PIN → dashboard.
3. Catat penjualan tunai, catat pengeluaran, lihat laporan Laba Rugi.
4. Unduh satu struk PDF dan satu laporan XLSX; buka filenya.
5. Unduh `pg_dump` database, restore ke DB kosong, jalankan `npm run db:check` (langkah
   backup/restore ada di bagian 6).

Login Google asli, Neon asli di Vercel, dan perangkat Android asli **tidak dapat diotomasi** di
lingkungan pengembangan; ketiganya harus Anda uji sendiri setelah deploy.

## 5. Yang TIDAK boleh dilakukan

- Jangan menambah ENV baru, `crons`, atau SDK pembayaran.
- Jangan menjalankan migrasi ke database produksi milik client lain / data yang bukan milik Anda.
- Jangan mengaktifkan kembali jalur migrasi otomatis di request (`ensureSchemaMigrated` sudah tidak
  dipanggil dari jalur request).
- Jangan menaikkan batas unggah berkas melebihi 4 MB (batas API) / 3 MB (pg-bytea) tanpa keputusan
  tertulis pemilik (K8).

## 6. Backup & restore (dijalankan sebelum serah terima)

```bash
# backup
pg_dump "postgres://...?sslmode=verify-full" -Fc -f backup.dump
# restore ke database kosong
createdb bf_restore
pg_restore -d "postgres://.../bf_restore?sslmode=verify-full" backup.dump
DATABASE_URL="postgres://.../bf_restore?sslmode=verify-full" npm run db:check
```

Catatan lingkungan pengembangan: binari PostgreSQL portabel yang dipakai saat pengujian hanya
menyertakan `postgres.exe`/`pg_ctl.exe` (tanpa `pg_dump`/`psql`), sehingga langkah `pg_dump` di atas
**belum dijalankan** pada rilis ini — lihat `LAPORAN_AKHIR.md` bagian "belum diuji".
