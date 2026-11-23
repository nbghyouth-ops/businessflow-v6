/**
 * Pengurai berkas generik (prompt R10 §A3.2, R12 langkah 1).
 *
 * Murni: tanpa DB, tanpa jaringan, tanpa eksekusi makro/formula/tautan eksternal.
 * Berkas dibaca menjadi GRID mentah (semua baris, semua sheet) supaya pengguna bisa
 * memilih sheet dan BARIS HEADER-nya sendiri — header bukan diasumsikan baris 1 dan
 * tidak ada tebakan provider.
 */
import { decodeText } from "@/lib/imports/csv";

export type Grid = {
  name: string;
  rows: string[][];
  hidden: boolean;
  /** Koordinat "baris:kolom" (1-based) sel berformula; nilainya cache, bukan angka mutakhir. */
  formulaCells?: string[];
};
export type ParsedWorkbook = {
  format: "csv" | "xlsx";
  encoding?: string;
  delimiter?: string;
  sheets: Grid[];
  warnings: string[];
};

export const PARSE_LIMITS = { maxBytes: 32 * 1024 * 1024, maxRowsPerSheet: 200_000, maxCells: 256 };

export class FileValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Mesin pemecah CSV yang dipakai bersama jalur sinkron (berkas kecil) dan jalur
 * bertahap (job berkas besar): satu implementasi, tanpa duplikasi aturan kutipan.
 */
/** Sel kosong / hanya spasi, tanpa alokasi (padanan `c.trim().length === 0`). */
function isBlankCell(c: string): boolean {
  for (let i = 0; i < c.length; i++) {
    const code = c.charCodeAt(i);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13 && code !== 0xa0) return false;
  }
  return true;
}

function csvSplitter(delimiter: string) {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let overflowCells = false;
  const rows: string[][] = [];

  const flushField = () => {
    row.push(row.length === 0 ? field.replace(/^\uFEFF/, "") : field);
    field = "";
    if (row.length > PARSE_LIMITS.maxCells) overflowCells = true;
  };
  const flushRow = () => {
    flushField();
    rows.push(row);
    row = [];
  };

  return {
    pushLine(line: string) {
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
          else if (ch === '"') inQuotes = false;
          else field += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === delimiter) flushField();
        else field += ch;
      }
      if (inQuotes) { field += "\n"; return; }
      flushRow();
    },
    finish(maxRows: number): { rows: string[][]; warnings: string[] } {
      if (field.length > 0 || row.length > 0) flushRow();
      const warnings: string[] = [];
      if (overflowCells) warnings.push(`ada baris dengan lebih dari ${PARSE_LIMITS.maxCells} sel; periksa pemisah`);
      // Baris kosong dibuang TANPA `trim()` per sel: `trim()` membuat string baru untuk
      // setiap sel, dan pada 50.000 baris langkah akhir ini sempat menahan event loop
      // >300 ms. Hasil penyaringan sama persis.
      const kept: string[][] = [];
      let nonBlank = 0;
      for (const r of rows) {
        let hasContent = false;
        for (const c of r) {
          if (!isBlankCell(c)) { hasContent = true; break; }
        }
        if (!hasContent) continue;
        nonBlank += 1;
        if (kept.length < maxRows) kept.push(r);
      }
      if (nonBlank > maxRows) warnings.push(`berkas melebihi ${maxRows} baris; sisa dipotong`);
      return { rows: kept, warnings };
    },
  };
}

/**
 * Baris per irisan parsing. 2.000 baris terukur menahan satu irisan hingga 289 ms
 * (di atas batas keras 300 ms termasuk sisa langkah); 250 baris ≈ 35 ms per irisan.
 */
const CSV_LINES_PER_TICK = 250;
/**
 * Pelepasan kendali saat parsing (R17 §2.2a).
 *
 * `setTimeout(0)` untuk SETIAP potongan terbukti membuat fase timer penuh sesak: pada
 * 50.000 baris parse menjadi 366 ms dinding dan monitor kelambatan event loop mencatat
 * 356 ms. `setImmediate` memakai fase check (jauh lebih murah); fase timer tetap diberi
 * giliran setiap 8 pelepasan supaya timer lain dan monitor benar-benar berjalan.
 */
let parserYieldCount = 0;
const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    parserYieldCount += 1;
    if (parserYieldCount % 8 === 0) setTimeout(resolve, 0);
    else setImmediate(resolve);
  });

/** Pemecah CSV tanpa deteksi header: seluruh baris dikembalikan apa adanya. */
export function splitCsv(text: string, delimiter: string, maxRows = PARSE_LIMITS.maxRowsPerSheet): { rows: string[][]; warnings: string[] } {
  const splitter = csvSplitter(delimiter);
  for (const line of text.split(/\r\n|\n|\r/)) splitter.pushLine(line);
  return splitter.finish(maxRows);
}

/**
 * Varian bertahap untuk berkas besar: memecah baris per potongan kecil dan
 * melepas kendali ke event loop, sehingga unggahan 50.000 baris tidak menahan
 * permintaan lain (anggaran langkah ≤200 ms).
 */
export async function splitCsvAsync(text: string, delimiter: string, maxRows = PARSE_LIMITS.maxRowsPerSheet): Promise<{ rows: string[][]; warnings: string[] }> {
  const splitter = csvSplitter(delimiter);
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i += 1) {
    splitter.pushLine(lines[i]);
    if ((i + 1) % CSV_LINES_PER_TICK === 0) await yieldToEventLoop();
  }
  return splitter.finish(maxRows);
}

/** Grid netral: buang baris kosong di ujung, jaga urutan kolom. */
function tidyGrid(name: string, rows: string[][], hidden: boolean): Grid {
  const cells = rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
  return { name, rows: cells, hidden };
}

export { decodeText };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

/** Apakah sel ini hasil formula (punya simpanan hasil/cache)? */
/** Serial Excel (Date) → teks ISO; nilai hari tetap, bukan string lokal mesin. */
function isoFromDate(d: Date): string {
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

/** Koordinat sel berformula yang kolomnya DIPETAKAN ke field transaksi. */
export function formulaCellsInMappedColumns(
  grid: { formulaCells?: string[] },
  headerRow: number,
  headers: string[],
  mapping: Record<string, string>,
): string[] {
  const mappedHeaders = new Set(Object.values(mapping));
  const mappedColumns = headers.map((h, i) => (mappedHeaders.has(h) ? i + 1 : 0)).filter((i) => i > 0);
  const firstDataSheetRow = headerRow + 2;
  return (grid.formulaCells ?? []).filter((ref) => {
    const [row, column] = ref.split(":").map(Number);
    return row >= firstDataSheetRow && mappedColumns.includes(column);
  });
}

function isFormulaValue(v: unknown): boolean {
  return typeof v === "object" && v !== null && ("formula" in (v as Record<string, unknown>) || "sharedFormula" in (v as Record<string, unknown>));
}

async function readXlsx(bytes: Uint8Array): Promise<ParsedWorkbook> {
  const mod = (await import("exceljs")) as unknown as { default?: { Workbook: new () => any }; Workbook?: new () => any };
  const WorkbookCtor = mod.default?.Workbook ?? mod.Workbook;
  if (!WorkbookCtor) throw new FileValidationError("STRUCTURE_INVALID", "Pembaca XLSX tidak tersedia.");
  const wb = new WorkbookCtor();
  try {
    await wb.xlsx.load(Buffer.from(bytes));
  } catch {
    throw new FileValidationError("STRUCTURE_INVALID", "Berkas XLSX tidak dapat dibaca (rusak atau bukan XLSX).");
  }
  const warnings: string[] = [];
  const sheets: Grid[] = (wb.worksheets ?? []).map((ws: any) => {
    const rows: string[][] = [];
    const formulaCells: string[] = [];
    const rowCount = Math.min(ws.rowCount ?? 0, PARSE_LIMITS.maxRowsPerSheet);
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const values: unknown[] = row?.values ?? [];
      const cells: string[] = [];
      const width = Math.min(Math.max((values.length ?? 1) - 1, 0), PARSE_LIMITS.maxCells);
      for (let c = 1; c <= width; c++) {
        const cell = row.getCell(c);
        const value = cell?.value;
        if (isFormulaValue(value)) {
          formulaCells.push(`${r}:${c}`);
          cells.push(cell?.text ?? "");
        } else if (value instanceof Date) {
          // Tanpa ini, tanggal serial terbaca sebagai "Wed Apr 01 2026 ..." dan
          // dianggap tanggal tidak valid (baris INVALID missing_date).
          cells.push(isoFromDate(value));
        } else {
          cells.push(cell?.text ?? "");
        }
      }
      rows.push(cells);
    }
    if (formulaCells.length > 0) {
      warnings.push(`sheet "${ws.name}": ${formulaCells.length} sel berformula — nilai cache TIDAK dianggap mutakhir; kolom tersebut perlu ditinjau.`);
    }
    const grid = tidyGrid(String(ws.name ?? "Sheet"), rows, ws.state === "hidden" || ws.state === "veryHidden");
    return { ...grid, hidden: grid.hidden, formulaCells };
  });
  if (sheets.length === 0) throw new FileValidationError("STRUCTURE_INVALID", "Berkas XLSX tidak berisi sheet.");
  return { format: "xlsx", sheets, warnings };
}

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ch && !inQ) n += 1;
  }
  return n;
}

/**
 * Pilih pemisah dari baris TERPADAT pada 20 baris pertama — bukan dari baris pertama.
 * Ekspor nyata sering punya preamble (judul laporan) sebelum baris header, dan preamble
 * itu tidak memuat pemisah apa pun sehingga baris pertama menyesatkan.
 */
export function pickDelimiter(lines: string[]): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    let score = 0;
    for (const line of lines.slice(0, 20)) score = Math.max(score, countOutsideQuotes(line, d));
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

const slow = (label: string, t0: number) => {
  const ms = Math.round(performance.now() - t0);
  if (ms > 150) console.warn(`[import-parse] ${label} ${ms} ms`);
};

async function readCsvBytes(bytes: Uint8Array, opts: { delimiter?: string; sheetName?: string }): Promise<ParsedWorkbook> {
  let t = performance.now();
  const { text, encoding } = decodeText(bytes);
  slow("decode", t);
  t = performance.now();
  const lines = text.split(/\r\n|\n|\r/);
  const delimiter = opts.delimiter ?? pickDelimiter(lines);
  slow("split-lines", t);
  t = performance.now();
  const { rows, warnings } = await splitCsvAsync(text, delimiter);
  slow("split-csv", t);
  if (rows.length === 0) throw new FileValidationError("FILE_VALIDATION_FAILED", "Berkas tidak berisi baris data.");
  t = performance.now();
  // `rows` dari pemecah CSV SUDAH `string[][]`; `tidyGrid` hanya akan menyalin ulang
  // 50.000 baris tanpa mengubah nilai (String(string) = string yang sama). Salinan itu
  // dibuang: satu blokir besar lebih sedikit saat parse berkas besar.
  const grid: Grid = { name: opts.sheetName ?? "CSV", rows, hidden: false };
  slow("tidy", t);
  return { format: "csv", encoding, delimiter, sheets: [grid], warnings };
}

/**
 * Baca berkas apa pun yang didukung menjadi grid. Ekstensi TIDAK dipercaya sendiri:
 * XLSX dikenali dari magic bytes, dan berkas dengan ekstensi XLSX yang bukan arsip ZIP
 * ditolak (tidak dicoba dibaca sebagai CSV diam-diam).
 */
export async function parseWorkbook(
  bytes: Uint8Array,
  filename: string,
  opts: { delimiter?: string } = {},
): Promise<ParsedWorkbook> {
  if (!bytes || bytes.length === 0) throw new FileValidationError("FILE_VALIDATION_FAILED", "Berkas kosong (0 byte).");
  if (bytes.length > PARSE_LIMITS.maxBytes) throw new FileValidationError("FILE_TOO_LARGE", "Berkas melebihi batas 32 MB.");
  const lower = filename.toLowerCase();
  const isZip = looksLikeZip(bytes);
  if (lower.endsWith(".xlsx")) {
    if (!isZip) throw new FileValidationError("STRUCTURE_INVALID", "Berkas berekstensi .xlsx tetapi isinya bukan arsip XLSX.");
    return readXlsx(bytes);
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return await readCsvBytes(bytes, opts);
  if (isZip) {
    throw new FileValidationError("FORMAT_NOT_SUPPORTED", "Berkas arsip/spreadsheet jenis ini belum didukung. Gunakan CSV atau XLSX.");
  }
  // Ekstensi lain (PDF, gambar, XLS lama, MT940, HTML, arsip) TIDAK dibaca sebagai CSV
  // diam-diam — pengguna diminta mengunduh CSV/XLSX dari portal sumber (D-22).
  throw new FileValidationError("FORMAT_NOT_SUPPORTED", "Jenis berkas ini belum didukung. Unduh CSV atau XLSX dari sumbernya.");
}

/** Skor kandidat baris header: banyak sel non-kosong, sedikit nilai yang tampak data. */
export function headerCandidates(rows: string[][], limit = 25): Array<{ index: number; score: number; preview: string[] }> {
  const looksData = (c: string) => /^[\d\s.,:/()-]+$/.test(c.trim()) && /\d/.test(c.trim());
  const out: Array<{ index: number; score: number; preview: string[] }> = [];
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = rows[i];
    const nonEmpty = cells.filter((c) => c.trim().length > 0);
    if (nonEmpty.length === 0) continue;
    const alpha = nonEmpty.filter((c) => /[A-Za-z]/.test(c)).length;
    const numeric = nonEmpty.filter(looksData).length;
    const score = alpha * 2 - numeric * 2 + (nonEmpty.length >= 2 ? 3 : 0) + (i === 0 ? 1 : 0);
    out.push({ index: i, score, preview: cells.slice(0, 8) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Ambil header + baris data dari posisi header yang DIPILIH pengguna. */
export function gridFromHeader(rows: string[][], headerRow: number): { headers: string[]; dataRows: string[][] } {
  if (headerRow < 0 || headerRow >= rows.length) return { headers: [], dataRows: [] };
  return { headers: rows[headerRow].map((h) => h.trim()), dataRows: rows.slice(headerRow + 1) };
}
