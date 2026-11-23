/**
 * Sumber tunggal identitas merek Business Flow (prompt R10 §A4.8).
 *
 * Aturan: HANYA berkas ini + `BrandLogo.tsx` + konfigurasi metadata Next yang boleh
 * merujuk berkas logo. Tidak ada `<img src="/logo...">`, CSS `background-image`, atau
 * SVG lambang inline di tempat lain.
 */

/** Nama merek adalah TEKS HIDUP (Plus Jakarta Sans), bukan bagian dari gambar lambang. */
export const BRAND_NAME = "Business Flow";

/** Lambang saja, rasio LANDSCAPE dari berkas sumber. */
export const BRAND_MARK_RATIO = 796 / 558; // ≈ 1,4265

/** Berkas lambang per kerapatan; nilai `width`/`height` adalah ukuran ASLI berkas (tanpa upscale). */
export const BRAND_MARKS = {
  128: { src: "/logo-mark-h128.png", width: 183, height: 128 },
  256: { src: "/logo-mark-h256.png", width: 365, height: 256 },
  512: { src: "/logo-mark-h512.png", width: 730, height: 512 },
} as const;

export type BrandMarkDensity = keyof typeof BRAND_MARKS;

/** Ikon aplikasi persegi (dipakai bila lambang terlalu kecil untuk terbaca). */
export const BRAND_APP_ICONS = {
  16: "/favicon-16.png",
  32: "/favicon-32.png",
  48: "/favicon-48.png",
  180: "/apple-touch-icon-180.png",
} as const;

/**
 * Tinggi tampil per ukuran (px). Lebar = tinggi × rasio; TIDAK boleh diregangkan.
 * xs sengaja tanpa wordmark (ikon sempit); di bawah 20 px pakai ikon aplikasi persegi.
 */
export const BRAND_SIZES = {
  xs: 20,
  sm: 28,
  md: 32,
  lg: 56,
  xl: 72,
} as const;

export type BrandSize = keyof typeof BRAND_SIZES;

/** Ukuran font wordmark mengikuti skala tipografi yang sudah ada (bukan font baru). */
export const BRAND_WORDMARK_FONT: Record<BrandSize, number> = {
  xs: 14,
  sm: 15,
  md: 17,
  lg: 24,
  xl: 30,
};

/**
 * Pilih berkas sesuai tinggi tampil × kerapatan layar (DPR).
 * Tujuan: jangan upscale di UI dan jangan kirim berkas 512 px untuk ikon 20 px.
 */
export function pickMark(height: number, dpr = 2): BrandMarkDensity {
  const need = height * dpr;
  if (need <= 128) return 128;
  if (need <= 256) return 256;
  return 512;
}
