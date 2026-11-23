/**
 * Presisi ekspor (R11-D §T5): satu-satunya tempat uang diubah menjadi teks.
 *
 * Aturan:
 *  - Uang SELALU `bigint` unit minor di memori (hasil `toCents`), tidak pernah `number`.
 *  - Konversi ke teks desimal eksak memakai `decimalsOf(currency)` — tidak ada pembagian
 *    floating point, tidak ada `Number()`. Berkas XLSX dan CSV memakai teks yang SAMA,
 *    sehingga paritas antar-format dapat diuji per sel.
 */
import { decimalsOf } from "@/lib/money";

/** Pecahan unit minor (`bigint`) → teks desimal eksak untuk mata uang tsb. */
export function minorToDecimal(minor: bigint, currency: string): string {
  const decimals = decimalsOf(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  if (decimals <= 0) return `${negative ? "-" : ""}${abs.toString()}`;
  const digits = abs.toString().padStart(decimals + 1, "0");
  const intPart = digits.slice(0, digits.length - decimals);
  const fracPart = digits.slice(digits.length - decimals);
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

/** Teks desimal → unit minor, tanpa float (dipakai uji paritas & pembaca ulang). */
export function decimalToMinor(text: string, currency: string): bigint {
  const raw = text.trim();
  if (!raw) return 0n;
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [intPart, fracPart = ""] = body.split(".");
  const decimals = decimalsOf(currency);
  // Kolom `numeric(18,2)` selalu datang dengan 2 desimal meski mata uangnya 0 desimal
  // (IDR). Desimal berlebih hanya boleh bila NOL semua; selain itu nilainya memang
  // tidak dapat diwakili presisi mata uang tsb → tolak, jangan dibulatkan diam-diam.
  const extra = fracPart.slice(decimals);
  if (extra && /[^0]/.test(extra)) {
    throw new Error(`Nilai ${raw} melebihi presisi ${currency} (${decimals} desimal)`);
  }
  const digits = `${intPart || "0"}${fracPart.slice(0, decimals).padEnd(decimals, "0")}`;
  if (!/^\d+$/.test(digits)) throw new Error(`Nilai uang tidak valid: ${raw}`);
  const value = BigInt(digits);
  return negative ? -value : value;
}

/**
 * Nilai uang dari kolom SQL `numeric`/BIGINT → teks eksak.
 * `null`/kosong berarti "tidak ada data" dan diekspor sebagai sel kosong, BUKAN 0.
 */
export function moneyText(value: unknown, currency: string): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  if (!/^\d+(\.\d+)?$/.test(body)) throw new Error(`Nilai uang tidak valid: ${raw}`);
  const minor = decimalToMinor(body, currency);
  return minorToDecimal(negative ? -minor : minor, currency);
}
