# Business Flow — by nbghstudio

Aplikasi pencatatan bisnis (**record-only**): Business Flow hanya **mencatat** kejadian yang terjadi
di luar aplikasi. Tidak ada pembayaran, transfer, pencairan, atau refund yang dieksekusi di sini.

Stack: Next.js 16 (App Router) · TypeScript strict · Drizzle ORM · Zod · PostgreSQL (Neon) · REST `/api/v1`.

## Mulai cepat (lokal)

```bash
npm ci
cp .env.example .env          # isi DATABASE_URL
npm run db:migrate            # 12 migrasi, idempoten
npm run db:check              # harus: 91 tabel, 75 tabel RLS
npm run dev
```

## Gerbang wajib

```bash
npm run verify        # typecheck + lint + unit + build + audit
npm run db:migrate    # butuh DATABASE_URL
npm run db:check
npm run test:integration   # butuh DATABASE_URL + hak CREATEDB
npm start             # produksi
```

Hasil audit terakhir (19 Nov 2026): typecheck/lint/unit(35)/build/audit **PASS**, integrasi
**28/28 PASS**, chaos **11/11 PASS**. Rincian bukti ada di `LAPORAN_AKHIR.md`.
Yang **belum** diuji: login Google asli, Neon/Vercel produksi, Android, Playwright lintas viewport.

## Deploy

Ikuti `PANDUAN_DEPLOY_PEMILIK.md`. Lima ENV: `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Catatan struktur

- `functions/` hanya dipakai tes unit/typecheck, bukan runtime Vercel.
- `tests/chaos/chaos.mjs` membutuhkan database kosong (jalur bootstrap perangkat).
