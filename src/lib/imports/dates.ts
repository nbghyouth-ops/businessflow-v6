/**
 * Pengurai tanggal untuk impor berkas (prompt R7-C §3.4/§8).
 *
 * Prinsip:
 *  - **zona eksplisit per sumber**: berkas TikTok memakai UTC (Statement Date UTC),
 *    bank Indonesia memakai waktu lokal Asia/Jakarta. Tanggal polos (tanpa jam)
 *    dianggap tanggal kalender di zona sumber dan TIDAK digeser;
 *  - **tanggal kosong → `null` + peringatan**, tidak pernah dikarang;
 *  - konversi zona memakai `Intl` (bukan perhitungan uang), sehingga tanggal
 *    hasilnya deterministik dan tidak bergantung zona mesin uji.
 */

export type ParsedDate = { iso: string | null; reason?: string; shifted?: boolean };

const MONTHS_ID: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, peb: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, may: 5,
  jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agustus: 8, aug: 8, sep: 9, september: 9, okt: 10,
  oktober: 10, oct: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12,
};

function pad(n: number): string { return String(n).padStart(2, "0"); }

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function expandYear(y: number): number {
  if (y >= 1000) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/**
 * Cache `Intl.DateTimeFormat` (R17 §2.2b).
 *
 * Membuat formatter BARU untuk setiap nilai tanggal terukur sangat mahal: profil commit
 * 50.000 baris mencatat normalisasi 15,4 dtk, dan biaya utamanya ada di sini. Formatter
 * bersifat immutable, jadi aman dipakai ulang. Cache dibatasi supaya zona waktu sembarang
 * dari berkas tidak menumbuhkan memori tanpa batas.
 */
const DTF_LIMIT = 32;
const dtfCache = new Map<string, Intl.DateTimeFormat>();
function cachedDateTimeFormat(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}`;
  const hit = dtfCache.get(key);
  if (hit) return hit;
  const fmt = new Intl.DateTimeFormat(locale, { ...options, timeZone });
  if (dtfCache.size >= DTF_LIMIT) dtfCache.clear();
  dtfCache.set(key, fmt);
  return fmt;
}

/** Ubah tanggal kalender + jam opsional pada zona `tz` menjadi ISO UTC (untuk perhitungan selisih hari). */
function toUtcIso(y: number, m: number, d: number, hh: number, mm: number, ss: number, tz: string): string | null {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  if (tz === "UTC") return new Date(guess).toISOString();
  try {
    const fmt = cachedDateTimeFormat("en-US", tz, {
      hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    // Offset dicari dengan dua percobaan (aman untuk DST): selisih jam tampilan vs UTC.
    const asUtc = (ms: number) => {
      const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    };
    let offset = asUtc(guess) - guess;
    offset = asUtc(guess - offset) - (guess - offset);
    return new Date(guess - offset).toISOString();
  } catch {
    return null;
  }
}

export type ParseDateOpts = { sourceTimeZone?: string };

/** Hasil: `{ date: "YYYY-MM-DD", iso: ISO8601, shifted }` — `date` dipakai untuk kolom tanggal. */
export function parseDate(raw: string | null | undefined, opts: ParseDateOpts = {}): ParsedDate & { date: string | null; isoFull: string | null } {
  const tz = opts.sourceTimeZone ?? "UTC";
  const s = String(raw ?? "").replace(/[\u00a0\u202f]/g, " ").trim();
  if (!s) return { iso: null, date: null, isoFull: null, reason: "kosong" };

  // 1. ISO dengan offset/Z eksplisit (mis. 2026-03-01T17:05:00Z atau +07:00)
  const isoOffset = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(s);
  if (isoOffset) {
    const parsed = new Date(s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    if (Number.isNaN(parsed.getTime())) return { iso: null, date: null, isoFull: null, reason: "tanggal tidak dikenali" };
    // Instan dengan offset eksplisit: tanggalnya ditampilkan di zona aplikasi
    // (Asia/Jakarta), bukan zona sumber — 17:05Z adalah 00:05 keesokan harinya di Jakarta.
    return fromInstant(parsed, JAKARTA_TZ);
  }

  // 2. Tanggal (+ jam opsional) tanpa zona: dianggap waktu di zona sumber.
  const numeric = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const c = Number(numeric[3]);
    let y: number, m: number, d: number;
    if (numeric[1].length === 4) { y = a; m = b; d = c; }
    else { d = a; m = b; y = expandYear(c); }
    if (!validYmd(y, m, d)) return { iso: null, date: null, isoFull: null, reason: `tanggal tidak valid: ${s}` };
    const hh = numeric[4] === undefined ? 0 : Number(numeric[4]);
    const mm = numeric[5] === undefined ? 0 : Number(numeric[5]);
    const ss = numeric[6] === undefined ? 0 : Number(numeric[6]);
    if (hh > 23 || mm > 59 || ss > 59) return { iso: null, date: null, isoFull: null, reason: `jam tidak valid: ${s}` };
    const utc = toUtcIso(y, m, d, hh, mm, ss, tz);
    if (!utc) return { iso: null, date: null, isoFull: null, reason: `zona ${tz} tidak dikenali` };
    const hasTime = numeric[4] !== undefined;
    return hasTime ? fromInstant(new Date(utc), "Asia/Jakarta") : { iso: `${y}-${pad(m)}-${pad(d)}`, date: `${y}-${pad(m)}-${pad(d)}`, isoFull: utc, shifted: false };
  }

  // 3. "31 Des 2026" / "31 Dec 2026" (+ jam opsional)
  const textual = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s);
  if (textual) {
    const d = Number(textual[1]);
    const m = MONTHS_ID[textual[2].toLowerCase()];
    const y = expandYear(Number(textual[3]));
    if (m && validYmd(y, m, d)) {
      const hh = textual[4] ? Number(textual[4]) : 0;
      const mm = textual[5] ? Number(textual[5]) : 0;
      const utc = toUtcIso(y, m, d, hh, mm, 0, tz);
      const hasTime = textual[4] !== undefined;
      return hasTime && utc ? fromInstant(new Date(utc), "Asia/Jakarta") : { iso: `${y}-${pad(m)}-${pad(d)}`, date: `${y}-${pad(m)}-${pad(d)}`, isoFull: utc, shifted: false };
    }
    return { iso: null, date: null, isoFull: null, reason: `tanggal tidak valid: ${s}` };
  }

  // 4. Serial Excel (mis. 45000) — hanya bila seluruhnya digit dan masuk rentang wajar 2000–2100.
  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    if (serial > 36526 && serial < 73050) {
      const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
      return fromInstant(new Date(ms), "Asia/Jakarta");
    }
  }

  return { iso: null, date: null, isoFull: null, reason: `format tanggal belum didukung: ${s}` };
}

/** Instan → tanggal kalender di zona tujuan (default Asia/Jakarta). */
function fromInstant(at: Date, targetTimeZone: string): ParsedDate & { date: string | null; isoFull: string | null } {
  const isoFull = at.toISOString();
  try {
    const fmt = cachedDateTimeFormat("en-CA", targetTimeZone, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
    const date = `${p.year}-${p.month}-${p.day}`;
    return { iso: date, date, isoFull, shifted: isoFull.slice(0, 10) !== date };
  } catch {
    // Zona tidak dikenali: nilai ISO tetap dikembalikan, tanggal kalender memakai UTC.
    return { iso: isoFull.slice(0, 10), date: isoFull.slice(0, 10), isoFull, shifted: false, reason: `zona ${targetTimeZone} tidak dikenali → tanggal memakai UTC` };
  }
}

export const DEFAULT_SOURCE_TZ = "UTC";
export const JAKARTA_TZ = "Asia/Jakarta";
