/** Teks layar status dalam bahasa Indonesia awam (F-01). Aman dipakai klien. */
export type ServiceStatusReason =
  | "OK"
  | "DATABASE_URL_MISSING"
  | "DATABASE_URL_INVALID"
  | "SCHEMA_NOT_MIGRATED"
  | "SCHEMA_NOT_READY"
  | "CONNECTION_ERROR"
  | "AUTH_NOT_CONFIGURED"
  | "MAINTENANCE"
  | "UNKNOWN";

export type StatusCopy = {
  title: string;
  description: string;
  steps: string[];
  tone: "warning" | "danger" | "info";
  retryLabel: string;
};

const COPY: Record<Exclude<ServiceStatusReason, "OK">, StatusCopy> = {
  DATABASE_URL_MISSING: {
    title: "Database belum terhubung",
    description:
      "Sistem belum memiliki alamat database sehingga data bisnis belum dapat disimpan. Ini biasanya terjadi pada pemasangan baru.",
    steps: [
      "Buat project Neon PostgreSQL (region Singapura) dan salin connection string pooled.",
      "Isi DATABASE_URL di Environment Variables Vercel, lalu deploy ulang.",
      "Buka kembali halaman ini setelah deploy selesai.",
    ],
    tone: "warning",
    retryLabel: "Coba lagi",
  },
  DATABASE_URL_INVALID: {
    title: "Alamat database tidak valid",
    description: "Alamat database yang terpasang tidak dapat dibaca. Data Anda tidak hilang; hanya koneksinya yang perlu diperbaiki.",
    steps: [
      "Periksa kembali isi DATABASE_URL di Vercel (tidak ada spasi atau tanda kutip).",
      "Pastikan memakai connection string pooled dari Neon.",
      "Simpan perubahan lalu deploy ulang.",
    ],
    tone: "warning",
    retryLabel: "Coba lagi",
  },
  SCHEMA_NOT_MIGRATED: {
    title: "Struktur database belum disiapkan",
    description: "Database sudah terhubung, tetapi tabel Business Flow belum dibuat. Satu langkah migrasi diperlukan.",
    steps: [
      "Jalankan npm run db:migrate dari komputer Anda, atau",
      "Tempel isi drizzle/ALL_IN_ONE.sql di Neon SQL Editor.",
      "Muat ulang halaman ini setelah migrasi selesai.",
    ],
    tone: "warning",
    retryLabel: "Coba lagi",
  },
  SCHEMA_NOT_READY: {
    title: "Struktur database sedang disiapkan",
    description:
      "Penyiapan tabel otomatis belum berhasil. Sistem akan mencoba lagi secara berkala; Anda juga dapat menjalankan migrasi manual.",
    steps: [
      "Tunggu satu menit lalu tekan Coba lagi.",
      "Bila tetap gagal, jalankan npm run db:migrate dengan DATABASE_URL yang sama.",
      "Pastikan user database memiliki izin membuat tabel.",
    ],
    tone: "warning",
    retryLabel: "Coba lagi",
  },
  CONNECTION_ERROR: {
    title: "Koneksi database sedang terganggu",
    description:
      "Server belum dapat menjangkau database. Data Anda aman. Sistem mencoba menyambung ulang secara otomatis.",
    steps: [
      "Periksa status project Neon (tidak dijeda atau melewati kuota).",
      "Tunggu beberapa saat, lalu tekan Coba lagi.",
      "Bila berlanjut, periksa kembali DATABASE_URL di Vercel.",
    ],
    tone: "danger",
    retryLabel: "Coba lagi",
  },
  AUTH_NOT_CONFIGURED: {
    title: "Login Google belum aktif",
    description:
      "Sebagian layanan berjalan, tetapi login dengan Google belum dapat dipakai. Anda masih dapat masuk melalui Mode Perangkat bila diizinkan.",
    steps: [
      "Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di Vercel.",
      "Pastikan redirect URI di Google Cloud sama persis dengan alamat aplikasi.",
      "Muat ulang halaman ini setelah konfigurasi tersimpan.",
    ],
    tone: "info",
    retryLabel: "Muat ulang",
  },
  MAINTENANCE: {
    title: "Sedang dalam perawatan",
    description: "Kami sedang melakukan perawatan singkat. Silakan kembali beberapa saat lagi.",
    steps: ["Tunggu beberapa menit.", "Muat ulang halaman ini."],
    tone: "info",
    retryLabel: "Coba lagi",
  },
  UNKNOWN: {
    title: "Layanan belum dapat diakses",
    description: "Terjadi gangguan yang belum dapat dikenali. Tim Anda dapat memeriksa Status Sistem untuk rincian.",
    steps: ["Muat ulang halaman ini.", "Bila berlanjut, hubungi pengelola sistem Anda."],
    tone: "danger",
    retryLabel: "Coba lagi",
  },
};

export function statusCopy(reason: ServiceStatusReason): StatusCopy {
  if (reason === "OK") {
    return {
      title: "Semua layanan berjalan normal",
      description: "Tidak ada gangguan yang terdeteksi.",
      steps: [],
      tone: "info",
      retryLabel: "Muat ulang",
    };
  }
  return COPY[reason] ?? COPY.UNKNOWN;
}

export function isServiceStatusReason(value: string | undefined | null): value is Exclude<ServiceStatusReason, "OK"> {
  return Boolean(value && value in COPY);
}
