# CAKUPAN TERJEMAHAN (i18n) — putaran R7

Diperbarui: 21 November 2026. **Tidak ada klaim "bilingual penuh".**

## Angka nyata `npm run i18n` (R7)

| Angka | Nilai |
|---|---|
| Teks sumber `tr("...")` di komponen | **1277** |
| Sudah punya terjemahan Inggris (`src/lib/ui-en.ts`) | **1277** (100% dari `tr()`) |
| Kunci kamus `messages/id.json` / `en.json` | 145 / 145 (paritas OK) |
| Literal UI tersisa di **komponen render** (`.tsx`) | **18** |
| Teks non-render (diktat `src/lib` + pesan `src/server`) | **242** (dicatat, di luar gerbang komponen) |

Perubahan R7: codemod `scripts/i18n-codemod.mjs` diperluas (prop `desc/hint/caption/help/
message/summary/note`, bidang objek `label:`/`title:`, `toast("...")`) dan dijalankan pada seluruh
komponen klien → **821 literal** dipindahkan ke kamus, **438 kunci Inggris baru** ditulis manual.
Ikut diperbaiki: `src/components/quick-tx.tsx` (akarnya label di dalam array JS + pesan galat) dan
`src/components/keypad.tsx` (`PinDots`), yang dulu lolos pemeriksa karena bukan teks JSX.

## Sisa yang jujur (BELUM 100%)

1. **18 judul langkah di `src/components/guide.tsx`** tetap berbahasa Indonesia. Berkas ini adalah
   modul data + komponen yang dirender **di server** (`/guide`, `/(app)/help`), sehingga `tr()` di
   dalamnya akan mengunci bahasa default dan tidak boleh dibungkus dari situ.
2. **242 teks non-render**: diktat `src/lib/resource-meta.ts` (label kolom ResourcePage),
   `src/lib/navigation.ts` (judul grup; label item sudah lewat kamus `nav.*`), serta
   **pesan galat Indonesia di `src/server/routes/*`**. Server seharusnya mengembalikan kode galat +
   parameter lalu diterjemahkan klien; refactor itu belum dikerjakan pada R7.
3. Bahasa masih berpindah lewat **muat ulang halaman** (preferensi tersimpan di server), bukan
   reaktif tanpa reload.
4. Pseudo-locale +40% dan pemeriksaan "kunci tak terpakai" belum menjadi gerbang yang menggagalkan.

Karena butir 1–2 masih ada, layar berbahasa Inggris pada modul tertentu **bukan** 100% Inggris.
Angka di atas adalah hasil pengukuran, bukan klaim cakupan penuh.

## Infrastruktur

| Komponen | Status | Bukti |
|---|---|---|
| Kamus `messages/id.json` + `messages/en.json` | ada, 145 kunci/bahasa | `tests/unit/i18n-messages.test.ts` |
| Fungsi `t(lang,key,vars)` (kunci) & `tr("teks")` (teks sumber) | ada | `src/lib/i18n.ts`, `src/lib/tr.ts` |
| Prioritas bahasa | pengguna → workspace → peramban → `id` | `resolveLang()` + tes |
| Preferensi per pengguna | kolom `user.locale` (migrasi `014_user_locale`) | `PATCH /account/preferences`, `GET /account/me` |
| Diterapkan saat muat (REG-01) | lulus | `tests/e2e/locale.spec.ts` (project Playwright `locale`) |
| Uang tetap BigInt, hanya format sadar-locale | ada | `/settings/language` pratinjau; engine BigInt |

## Cara memeriksa ulang

```bash
npm run i18n                                  # paritas + 1277/1277 + hitungan literal
node scripts/i18n-missing.mjs                 # daftar tr() tanpa terjemahan (harus MISSING 0)
node scripts/i18n-codemod.mjs --dry <berkas>  # perkirakan kunci baru sebelum menyunting
```

---

## Angka nyata `npm run i18n` (R7-C, 21 November 2026)

| Angka | Nilai |
|---|---|
| Teks sumber `tr("...")` | **1294** (R7: 1277) |
| Sudah punya terjemahan Inggris | **1294** → 100% dari `tr()` |
| Kunci kamus `messages/id.json` / `en.json` | 145 / 145 (paritas OK) |
| Literal UI tersisa di **komponen render** (`.tsx`) | **18** (sama seperti R7; tidak bertambah) |
| Teks non-render (diktat `src/lib` + pesan `src/server`) | **255** |

**Teks baru R7-C yang diterjemahkan**: 34 kunci (wizard impor pencatatan, katalog
informasi etalase, artikel bantuan “Apa yang TIDAK dilakukan aplikasi ini”, label
“belum diverifikasi”, dsb). Semua teks UI baru pada putaran ini memakai `tr()` sejak
awal — tidak ada penambahan literal.

**Yang tetap belum**: 18 literal komponen (terutama `guide.tsx` yang dirender server)
dan 255 teks non-render (pesan galat server + diktat) — dicatat apa adanya, bukan
diklaim selesai.
