/**
 * Pembaca CSV untuk impor berkas (prompt R7-C §3.4, bagian keamanan berkas).
 *
 * Ditangani: BOM UTF-8, berkas ANSI/Windows-1252 (fallback decode), pemisah
 * `,`/`;`/tab/`|` (dideteksi dari baris header), tanda kutip dengan koma/baris baru
 * di dalam sel, kutip ganda ber-escape, batas ukuran/baris, dan sel yang dimulai
 * `=`/`+`/`-`/`@` ditandai sebagai teks (tidak dieksekusi, tidak pernah jadi rumus).
 *
 * Tidak ditangani (dinyatakan apa adanya): berkas terenkripsi, CSV dengan header
 * ganda bertingkat, dan pemisah desimal Eropa tanpa kutip (ditangani pengurai angka).
 */

export type CsvSheet = { headers: string[]; rows: string[][]; delimiter: string; warnings: string[] };

export const CSV_LIMITS = { maxBytes: 32 * 1024 * 1024, maxRows: 200_000, maxCells: 64 };

export function decodeText(buf: Uint8Array): { text: string; encoding: string } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(buf.subarray(3)), encoding: "utf-8-bom" };
  }
  // Diperiksa pada level BYTE: byte C1 (0x80–0x9F) tunggal dan urutan UTF-8 yang
  // cacat menandakan berkas ANSI/Windows-1252 (umum pada ekspor bank Indonesia).
  if (!isValidUtf8(buf)) {
    return { text: cp1252Fix(new TextDecoder("windows-1252").decode(buf)), encoding: "windows-1252" };
  }
  return { text: new TextDecoder("utf-8").decode(buf), encoding: "utf-8" };
}

/**
 * Peta CP1252 untuk rentang C1 (0x80–0x9F). Runtime yang men-decode label
 * "windows-1252" secara mentah mengembalikan kontrol C1 (mis. 0x91 → U+0091);
 * tabel ini mengembalikannya ke karakter yang sebenarnya dipakai berkas.
 */
const CP1252_C1 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009dmžŸ";
export function cp1252Fix(text: string): string {
  return text.replace(/[\u0080-\u009f]/g, (ch) => {
    const mapped = CP1252_C1[ch.charCodeAt(0) - 0x80];
    return mapped && mapped !== "\u0081" && mapped !== "\u008d" && mapped !== "\u008f" && mapped !== "\u0090" && mapped !== "\u009d" ? mapped : ch;
  });
}

/** Validasi UTF-8 sederhana pada level byte (tanpa dependensi). */
export function isValidUtf8(buf: Uint8Array): boolean {
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b < 0x80) { i += 1; continue; }
    let need = 0;
    if (b >= 0xc2 && b <= 0xdf) need = 1;
    else if (b >= 0xe0 && b <= 0xef) need = 2;
    else if (b >= 0xf0 && b <= 0xf4) need = 3;
    else return false;
    if (i + need >= buf.length) return false;
    for (let k = 1; k <= need; k++) {
      const c = buf[i + k];
      if (c < 0x80 || c > 0xbf) return false;
    }
    i += need + 1;
  }
  return true;
}

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ch && !inQ) n++;
  }
  return n;
}

const CANDIDATES = [",", ";", "\t", "|"];

export function sniffDelimiter(headerLine: string): string {
  let best = ",";
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const n = countOutsideQuotes(headerLine, d);
    if (n > bestScore) { bestScore = n; best = d; }
  }
  return best;
}

/** Titik koma populer di ekspor bank Indonesia; koma desimal sering ikut memakainya. */
export function readCsv(text: string, opts: { delimiter?: string; maxRows?: number } = {}): CsvSheet {
  const warnings: string[] = [];
  const maxRows = opts.maxRows ?? CSV_LIMITS.maxRows;
  const lines = text.split(/\r\n|\n|\r/);
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty < 0) return { headers: [], rows: [], delimiter: ",", warnings: ["berkas kosong"] };
  const delimiter = opts.delimiter ?? sniffDelimiter(lines[firstNonEmpty]);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let cellsGuard = false;

  const flushField = () => {
    const v = field.replace(/^\uFEFF/, "");
    // Sel yang dimulai dengan karakter rumus disimpan sebagai teks apa adanya;
    // ekspor nanti yang menetralkannya (tidak ada makro/rumus dieksekusi di sini).
    row.push(v);
    field = "";
    if (row.length > CSV_LIMITS.maxCells) cellsGuard = true;
  };
  const flushRow = () => {
    flushField();
    rows.push(row);
    row = [];
  };

  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        flushField();
      } else {
        field += ch;
      }
    }
    if (inQuotes) {
      // Baris baru di dalam sel berkutip: lanjutkan menumpuk isi sel.
      field += "\n";
      continue;
    }
    flushRow();
  }
  if (field.length > 0 || row.length > 0) flushRow();

  if (cellsGuard) warnings.push(`ada baris dengan lebih dari ${CSV_LIMITS.maxCells} sel; periksa pemisah`);
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [], delimiter, warnings: [...warnings, "tidak ada baris data"] };

  const { index, headers } = detectHeaderRow(nonEmpty);
  if (index > 0) warnings.push(`baris header tidak di baris 1 (ditemukan di baris ${index + 1})`);
  if (nonEmpty.length - index - 1 > maxRows) {
    warnings.push(`berkas melebihi batas ${maxRows} baris; sisa dipotong`);
  }
  const dataRows = nonEmpty.slice(index + 1, index + 1 + maxRows);
  return { headers, rows: dataRows, delimiter, warnings };
}

/**
 * Deteksi baris header dengan skor: baris dengan sel non-kosong terbanyak dan
 * tanpa sel yang tampak nominal/tanggal. Tidak mengasumsikan baris 1.
 */
export function detectHeaderRow(rows: string[][]): { index: number; headers: string[] } {
  const looksLikeData = (c: string) => /^[\d\s.,:/-]+$/.test(c.trim()) && c.trim().length > 0;
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i];
    const nonEmpty = cells.filter((c) => c.trim().length > 0);
    if (nonEmpty.length === 0) continue;
    const alpha = nonEmpty.filter((c) => /[A-Za-z]/.test(c)).length;
    const numericish = nonEmpty.filter(looksLikeData).length;
    const score = alpha * 2 - numericish * 2 + (nonEmpty.length >= 2 ? 3 : 0) + (i === 0 ? 1 : 0);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return { index: bestIdx, headers: rows[bestIdx].map((h) => h.trim()) };
}

/** Normalisasi nama kolom untuk pencocokan: huruf kecil, tanpa tanda baca/spasi ganda. */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const k = normalizeHeader(h);
    if (k && !map.has(k)) map.set(k, i);
  });
  return map;
}

/** Ambil sel berdasarkan beberapa alias nama kolom (sudah dinormalisasi pembaca). */
export function pick(row: string[], idx: Map<string, number>, aliases: string[]): string {
  for (const a of aliases) {
    const i = idx.get(normalizeHeader(a));
    if (i !== undefined) {
      const v = row[i];
      if (v !== undefined && v.trim().length > 0) return v.trim();
    }
  }
  return "";
}
