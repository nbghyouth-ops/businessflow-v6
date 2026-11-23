import Image from "next/image";
import { tr } from "@/lib/tr";
import {
  BRAND_APP_ICONS,
  BRAND_MARKS,
  BRAND_NAME,
  BRAND_SIZES,
  BRAND_WORDMARK_FONT,
  pickMark,
  type BrandSize,
} from "./brand-config";

export type BrandLogoProps = {
  /**
   * `mark` = lambang saja; `full` = lambang + wordmark teks hidup "Business Flow".
   * `xs` selalu lambang saja (terlalu sempit untuk wordmark).
   */
  variant?: "mark" | "full";
  size?: BrandSize;
  className?: string;
  /**
   * Wordmark pada `full` dapat disembunyikan pada breakpoint tertentu lewat kelas
   * Tailwind pada elemen ber-`data-brand-wordmark` (mis. sidebar rail 88 px).
   * Diteruskan ke pembungkus; tidak menambah berkas logo kedua.
   */
};

/**
 * Satu-satunya komponen yang boleh menampilkan lambang Business Flow (prompt R10 §A4.8.1).
 *
 * - `next/image` dengan `width`/`height` eksplisit (tanpa CLS), `sizes` sesuai ukuran tampil.
 * - `priority` sengaja TIDAK di-hardcode di sini: pemanggil di posisi LCP (login/header)
 *   memakai `priority` lewat prop `className`? Tidak — lihat catatan di bawah.
 * - Tanpa varian gelap, tanpa filter/recolor/invert/drop-shadow (tema terang saja).
 * - Bila wordmark tampil, gambar bersifat dekoratif (`alt=""`) dan tautan induk memakai
 *   `aria-label`; bila lambang berdiri sendiri, `alt` dari kamus i18n.
 */
export function BrandLogo({
  variant = "full",
  size = "md",
  className = "",
  priority = false,
}: BrandLogoProps & { priority?: boolean }) {
  const height = BRAND_SIZES[size];
  const showWordmark = variant === "full" && size !== "xs";

  // Di bawah 20 px lambang tidak terbaca → pakai ikon aplikasi persegi (bukan lambang diperkecil).
  if (height < 20) {
    const icon = BRAND_APP_ICONS[32];
    return (
      <span className={`inline-flex items-center ${className}`}>
        <Image src={icon} alt={tr("Logo Business Flow")} width={height} height={height} sizes={`${height}px`} priority={priority} />
      </span>
    );
  }

  const density = pickMark(height);
  const mark = BRAND_MARKS[density];
  const width = Math.round(height * (mark.width / mark.height));

  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(height / 2) }}>
      <Image
        src={mark.src}
        alt={showWordmark ? "" : tr("Logo Business Flow")}
        width={mark.width}
        height={mark.height}
        sizes={`${width}px`}
        priority={priority}
        style={{ width, height, objectFit: "contain" }}
        data-brand-mark=""
      />
      {showWordmark ? (
        <span
          data-brand-wordmark=""
          title={BRAND_NAME}
          className="truncate font-bold leading-none tracking-tight text-ink"
          style={{ fontSize: BRAND_WORDMARK_FONT[size] }}
        >
          {BRAND_NAME}
        </span>
      ) : null}
    </span>
  );
}
