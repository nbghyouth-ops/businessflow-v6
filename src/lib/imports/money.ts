/**
 * Pengurai nominal untuk impor berkas (prompt R7-C §3.4).
 *
 * Aturan yang mengikat:
 *  - hasil akhir selalu **BigInt unit minor** (sen), bukan float;
 *  - **tidak ada** `Number()`, `parseFloat`, `parseInt`, atau operator float di
 *    jalur uang — diuji statis oleh `tests/unit/imports-numbers.test.ts`;
 *  - angka sadar-locale: `1.234,56` (id) dan `1,234.56` (en) sama-sama benar;
 *  - `(1.000)` dan `-1.000` dan `−1.000` (minus Unicode) → negatif;
 *  - penanda bank `DB`/`D`/`K` (debit) dan `CR`/`C` (kredit) diterapkan terpisah
 *    lewat `applyMarker`, bukan ditebak dari tanda angka;
 *  - nilai yang tidak dikenali → `null` + alasan (TIDAK pernah diubah menjadi 0).
 */

export type ParsedAmount = { minor: bigint | null; reason?: string };
export type AmountOpts = {
  scale?: number;
  /**
   * Pemisah desimal yang dipakai berkas. `auto` (default) memakai aturan:
   *  - ada `.` dan `,`  → yang TERAKHIR adalah desimal;
   *  - hanya satu pemisah dengan ekor 3 digit → dianggap pemisah RIBUAN
   *    (konvensi Indonesia; nilai uang 3 digit desimal tidak lazim untuk IDR).
   * Ambiguitas seperti "10,005" dapat dilenyapkan pemanggil lewat `decimalHint`
   * (lihat `detectDecimalSeparator`).
   */
  decimalHint?: "auto" | "comma" | "dot";
};

const DIGITS = /^[0-9]+$/;
/** Nilai bulat polos tanpa pemisah/simbol — jalur cepat `parseAmount` (R17 §2.2b). */
const PLAIN_INTEGER = /^[0-9]{1,15}$/;

/** Buang simbol mata uang, spasi (termasuk NBSP), dan tanda kutip. */
function strip(raw: string): string {
  return raw
    .replace(/[\u00a0\u202f\s]/g, "")
    .replace(/^(rp|idr|usd|eur|sgd|myr|thb|php|vnd|jpy|cny|\$|€|£|¥)/i, "")
    .replace(/(rp|idr|usd|eur|sgd|myr|thb|php|vnd|jpy|cny)$/i, "")
    .replace(/["']/g, "");
}

/**
 * Deteksi pemisah desimal berkas dari beberapa contoh nominal.
 * Aturan: pemisah yang diikuti PERSIS 2 digit pada mayoritas contoh adalah desimal.
 */
export function detectDecimalSeparator(samples: string[]): "comma" | "dot" | null {
  let comma = 0;
  let dot = 0;
  for (const raw of samples) {
    const s = strip(String(raw ?? ""));
    if (!s) continue;
    if (/,\d{2}$/.test(s)) comma += 1;
    if (/\.\d{2}$/.test(s)) dot += 1;
  }
  if (comma === 0 && dot === 0) return null;
  if (comma > dot) return "comma";
  if (dot > comma) return "dot";
  return null;
}

/** Bagi string menjadi bagian bulat/desimal dengan aturan locale, murni berbasis teks. */
function splitAmount(body: string, hint: "auto" | "comma" | "dot" = "auto"): { sign: 1 | -1; intPart: string; decPart: string } | null {
  let sign: 1 | -1 = 1;
  let s = body;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-") || s.startsWith("\u2212") || s.startsWith("\u2013")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let intPart = s;
  let decPart = "";
  if (lastDot >= 0 && lastComma >= 0) {
    // Keduanya ada: yang TERAKHIR adalah pemisah desimal, satunya pemisah ribuan.
    const cut = lastDot > lastComma ? lastDot : lastComma;
    intPart = s.slice(0, cut);
    decPart = s.slice(cut + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const other = sep === "," ? "." : ",";
    if (s.includes(other)) return null;
    const parts = s.split(sep);
    const tail = parts[parts.length - 1] ?? "";
    const grouped = parts.length > 2 && parts.slice(1).every((p) => p.length === 3);
    if (parts.length > 2 && !grouped) return null; // "12,3,4" bukan nominal yang sah
    const hintSaysDecimal = hint !== "auto" && ((hint === "comma" && sep === ",") || (hint === "dot" && sep === "."));
    if (hintSaysDecimal) {
      intPart = parts[0] ?? "";
      decPart = tail;
    } else if (grouped || (tail.length === 3 && parts.length === 2 && parts[0].length > 0 && parts[0].length <= 3)) {
      // "1.234"/"10,005": ambigu → diperlakukan ribuan (konvensi Indonesia).
      intPart = parts.join("");
    } else {
      intPart = parts.slice(0, -1).join("");
      decPart = tail;
    }
  }

  intPart = intPart.replace(/[.,]/g, "");
  decPart = decPart.replace(/[.,]/g, "");
  if (intPart.length > 0 && !DIGITS.test(intPart)) return null;
  if (decPart.length > 0 && !DIGITS.test(decPart)) return null;
  if (intPart.length === 0 && decPart.length === 0) return null;
  // Lebih dari 6 digit desimal bukan nominal uang yang sah (mis. koordinat/timestamp).
  if (decPart.length > 6) return null;
  return { sign, intPart: intPart.length ? intPart : "0", decPart };
}

/**
 * `scale` = jumlah digit desimal mata uang (IDR = 2 pada penyimpanan proyek ini).
 * Nilai dengan lebih banyak desimal dibulatkan setengah-ke-atas secara manual
 * (tanpa float): sisa digit >= 5 menaikkan digit terakhir.
 */
export function parseAmount(raw: string | null | undefined, opts: AmountOpts = {}): ParsedAmount {
  const scale = opts.scale ?? MONEY_SCALE;
  if (raw === null || raw === undefined) return { minor: null, reason: "kosong" };
  const text = String(raw);
  // Jalur cepat: digit polos tidak berubah oleh `strip()` (tidak ada simbol/spasi/pemisah),
  // jadi empat pemindaian regex dapat dilewati. Hasilnya IDENTIK dengan jalur umum.
  if (scale >= 0 && scale <= 6 && PLAIN_INTEGER.test(text)) {
    return { minor: BigInt(text) * 10n ** BigInt(scale) };
  }
  const trimmed = strip(text);
  if (!trimmed) return { minor: null, reason: "kosong" };
  const parts = splitAmount(trimmed, opts.decimalHint ?? "auto");
  if (!parts) return { minor: null, reason: "nominal tidak dikenali" };

  const { sign, intPart, decPart } = parts;
  const kept = decPart.slice(0, scale).padEnd(scale, "0");
  const rest = decPart.slice(scale);
  let minor = BigInt(intPart) * 10n ** BigInt(scale) + BigInt(kept);
  if (rest.length > 0 && BigInt(rest[0]) >= 5n) minor += 1n;
  return { minor: sign === -1 ? -minor : minor };
}

/** Penanda mutasi bank: `DB`/`D` (debit) negatif, `CR`/`C` (kredit) positif. */
export function markerSign(marker: string | null | undefined): 1 | -1 | null {
  const m = String(marker ?? "").trim().toUpperCase();
  if (!m) return null;
  if (m === "DB" || m === "D" || m === "DEBIT" || m === "DR") return -1;
  if (m === "CR" || m === "C" || m === "KREDIT" || m === "CREDIT") return 1;
  return null;
}

/** Terapkan penanda arah pada nominal bertanda-positif hasil `parseAmount`. */
export function applyMarker(minor: bigint, marker: string | null | undefined): bigint {
  const s = markerSign(marker);
  if (s === null) return minor;
  const abs = minor < 0n ? -minor : minor;
  return s === -1 ? -abs : abs;
}

/** Tampilan unit minor → desimal (hanya untuk pesan/tabel, bukan perhitungan). */
export function formatMinor(minor: bigint, scale = 2): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const frac = abs % base;
  return `${neg ? "-" : ""}${whole.toString()}.${frac.toString().padStart(scale, "0")}`;
}

export const MONEY_SCALE = 2;
