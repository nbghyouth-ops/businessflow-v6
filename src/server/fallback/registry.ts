/**
 * Registri TUNGGAL seluruh fallback (kontrak 4.1 butir 7).
 * Setiap fallback wajib terdaftar di sini: id, pemicu, efek, batas, durasi, cara mematikan.
 * Modul ini murni data (tanpa impor server) sehingga aman dipakai di klien untuk
 * menampilkan penjelasan mode cadangan.
 */
export type FallbackId =
  | "F-01"
  | "F-02"
  | "F-03"
  | "F-04"
  | "F-05"
  | "F-06"
  | "F-07"
  | "F-08"
  | "F-09"
  | "F-10"
  | "F-11"
  | "F-12"
  | "F-13"
  | "F-14"
  | "F-15"
  | "F-16";

export type FallbackDefinition = {
  id: FallbackId;
  name: string;
  /** Kondisi yang menyalakan fallback (selalu SETELAH jalur utama gagal). */
  trigger: string;
  /** Perilaku saat aktif. */
  effect: string;
  /** Batasan keras: apa yang tidak pernah dilakukan fallback. */
  limit: string;
  /** Berapa lama fallback bertahan. */
  duration: string;
  /** Cara mematikan. */
  disable: string;
};

export const FALLBACK_REGISTRY: readonly FallbackDefinition[] = [
  {
    id: "F-01",
    name: "Layar Status Layanan Terpadu",
    trigger: "Database tidak terjangkau, skema belum siap, atau konfigurasi auth tidak lengkap.",
    effect: "Menampilkan ServiceStatusScreen berbahasa Indonesia dengan tombol Coba lagi dan langkah perbaikan.",
    limit: "Tidak membocorkan nama/nilai secret; tidak menampilkan stack trace.",
    duration: "Selama kondisi gagal bertahan; otomatis hilang setelah pulih.",
    disable: "Saklar system_flags.fallbacks_enabled=false.",
  },
  {
    id: "F-02",
    name: "Fallback Konfigurasi Auth",
    trigger: "BETTER_AUTH_SECRET kosong/<32 karakter atau BETTER_AUTH_URL tidak valid, sementara Google dikonfigurasi.",
    effect: "Membangkitkan secret 32 byte ke tabel app_secrets dan/atau menurunkan baseURL dari VERCEL_* tepercaya.",
    limit: "Tidak pernah memakai header Host/Origin; tidak pernah mengirim secret ke klien/log.",
    duration: "Sampai ENV valid diisi (ENV selalu menang).",
    disable: "Saklar global fallback; isi ENV yang valid.",
  },
  {
    id: "F-03",
    name: "Ketahanan Database",
    trigger: "Kegagalan koneksi/pool/timeout PostgreSQL (ECONNREFUSED, 08006, 57P01, too many connections, dll.).",
    effect: "Respons 503 service_unavailable + Retry-After; retry terbatas hanya untuk baca/idempoten; banner menyambung ulang.",
    limit: "Tidak pernah mengulang tulis non-idempoten; tidak ada antrean tulis offline.",
    duration: "Per request; retry maksimum 2 kali dengan jitter.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-04",
    name: "Fallback Migrasi Otomatis",
    trigger: "Migrasi runtime gagal (izin DDL kurang, lock timeout, checksum berubah).",
    effect: "Keadaan SCHEMA_NOT_READY dengan cache kegagalan pendek + layar status; migrasi manual tetap tersedia.",
    limit: "Migrasi tidak pernah destruktif; tidak retry tanpa batas.",
    duration: "Cache kegagalan 30 detik sebelum dicoba lagi.",
    disable: "Saklar global fallback; jalankan npm run db:migrate.",
  },
  {
    id: "F-05",
    name: "Fallback Rate Limit",
    trigger: "Tabel/query rate limit database gagal.",
    effect: "Limiter memori yang LEBIH KETAT untuk PIN/login/pairing, sementara kondisi pulih.",
    limit: "Fail-closed: batas diturunkan, tidak pernah dilepas.",
    duration: "Selama query DB gagal.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-06",
    name: "Jalur Login Cadangan Terkendali",
    trigger: "Google belum dikonfigurasi (Mode Perangkat) atau kegagalan infrastruktur Google berulang (Masuk Darurat).",
    effect: "Bootstrap perangkat sekali pakai atau sesi darurat 8 jam dengan izin terbatas.",
    limit: "Tidak pernah melewati PIN/RLS; tidak memperluas izin; tanpa undangan anggota.",
    duration: "Mode Perangkat permanen sampai Google dihubungkan; sesi darurat maksimum 8 jam.",
    disable: "Saklar global fallback; konfigurasi Google; cabut sesi darurat.",
  },
  {
    id: "F-07",
    name: "Ketahanan Sesi",
    trigger: "Sesi kedaluwarsa/dicabut, cookie rusak, callback Google gagal.",
    effect: "Redirect ramah ke /sign-in dengan alasan yang dapat ditindaklanjuti; sesi tab habis menjadi PIN lock.",
    limit: "Tidak pernah membuat sesi baru tanpa autentikasi.",
    duration: "Per kejadian.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-08",
    name: "Error Boundary Berlapis",
    trigger: "Error render React pada halaman atau widget.",
    effect: "global-error/error/not-found/loading + WidgetBoundary mengganti hanya widget yang rusak.",
    limit: "Tidak menelan error keamanan; tidak menampilkan stack trace ke pengguna.",
    duration: "Sampai pengguna memuat ulang / widget pulih.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-09",
    name: "Fallback Pustaka Dinamis & Ekspor",
    trigger: "import() pustaka PDF/XLSX/canvas gagal atau unduhan Blob diblokir.",
    effect: "Menawarkan format cadangan (PDF→PNG/CSV, XLSX→CSV, PNG→PDF) tanpa menutup modal.",
    limit: "Tidak pernah menampilkan 'berhasil' sebelum artefak tersedia.",
    duration: "Per operasi ekspor.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-10",
    name: "Fallback Visual & Kapabilitas Browser",
    trigger: "Grafik kosong/gagal, avatar gagal, API browser tidak tersedia.",
    effect: "Tabel data setara, inisial avatar, tampilan statis tanpa animasi; prefers-reduced-motion dihormati.",
    limit: "Konten tetap muncul; tidak memblokir peramban lama yang masih bisa jalan.",
    duration: "Per render.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-11",
    name: "Fallback Data & Format",
    trigger: "Zona waktu/lokal/mata uang/template tidak dikenal, nilai tidak dapat diformat.",
    effect: "Asia/Jakarta, id-ID, IDR, 'Bisnis Lainnya', dan '—' alih-alih NaN/undefined.",
    limit: "Izin/peran tidak dikenal selalu DITOLAK (fail-closed).",
    duration: "Per nilai.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-12",
    name: "Fallback Notifikasi & Pekerjaan Latar",
    trigger: "Dispatcher Neon Function tidak aktif/terlambat.",
    effect: "Notifikasi, pengingat, dan angka dashboard dihitung saat dibaca; pembersihan oportunistik idempoten.",
    limit: "Tidak pernah mengubah data keuangan/stok.",
    duration: "Selamanya (desain tanpa scheduler).",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-13",
    name: "Fallback Penyimpanan File",
    trigger: "Adapter S3/objek opsional gagal.",
    effect: "Kembali ke pg-bytea untuk berkas ≤ 3 MB dengan pemberitahuan.",
    limit: "Berkas > 3 MB ditolak jelas, tidak dipotong diam-diam.",
    duration: "Per unggahan.",
    disable: "Saklar global fallback; nonaktifkan adapter opsional.",
  },
  {
    id: "F-14",
    name: "Fallback Android/WebView",
    trigger: "Plugin Credential Manager tidak tersedia/gagal atau CAP_SERVER_URL kosong.",
    effect: "Pesan jelas dan arahan masuk lewat peramban sistem (Custom Tabs), bukan WebView tertanam.",
    limit: "Tidak memuat halaman login di WebView tertanam.",
    duration: "Per percobaan login.",
    disable: "Saklar global fallback.",
  },
  {
    id: "F-15",
    name: "Halaman Status Sistem",
    trigger: "Dibuka owner/admin di /settings/system-status.",
    effect: "Ringkasan DB, skema, sumber konfigurasi Google, mode auth, jalur darurat, aktivasi fallback 24 jam.",
    limit: "Tanpa secret; tombol beraksi butuh PIN.",
    duration: "Selalu tersedia bagi owner/admin.",
    disable: "Tidak relevan (halaman baca).",
  },
  {
    id: "F-16",
    name: "Fallback Logging",
    trigger: "Tabel log/audit gagal ditulis.",
    effect: "console terstruktur tanpa rahasia; request tidak diblokir.",
    limit: "Tidak pernah menulis PII/secret ke log.",
    duration: "Per kejadian.",
    disable: "Saklar global fallback.",
  },
];

export const FALLBACK_BY_ID: Readonly<Record<string, FallbackDefinition>> = Object.fromEntries(
  FALLBACK_REGISTRY.map((f) => [f.id, f]),
);

/** Konstanta pelindung terakhir: bila false, seluruh fallback dimatikan tanpa membaca DB. */
export const FALLBACKS_ENABLED_CONSTANT = true;
