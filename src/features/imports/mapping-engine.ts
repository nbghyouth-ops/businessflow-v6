/**
 * Mesin pemetaan (prompt R10 §A2/AL-1, R12 langkah 1). Murni — tanpa DB.
 *
 * Pengguna memetakan kolom berkas ke field kanonik; tidak ada tebakan, tidak ada
 * alias provider bawaan, dan satu kolom sumber tidak boleh diarahkan ke dua target
 * berbeda tanpa aturan transformasi eksplisit (ditolak di sini).
 */
import { normalizeHeader } from "@/lib/imports/csv";
import { parseAmount } from "@/lib/imports/money";
import { parseDate } from "@/lib/imports/dates";
import { maskPii } from "@/lib/imports/pii";
import type { AmountRule, ReportTypeDef } from "./canonical-fields";
import type { RowStatus } from "./state";

export type ParsingOptions = {
  decimalHint?: "auto" | "comma" | "dot";
  dateFormat?: "auto" | "dmy" | "mdy";
  /** Zona waktu sumber, hanya bila dikonfirmasi pengguna. */
  sourceTimeZone: string;
  /** Mata uang dari berkas atau konfigurasi toko/rekening yang dikonfirmasi. */
  currencyCode?: string;
  /** Arah nominal bank: kolom terpisah, satu kolom bertanda, atau belum dipilih. */
  amountRule?: AmountRule | "unspecified";
};

export type ColumnMap = Record<string, string>;

export type MappingValidation = {
  ok: boolean;
  /** Field wajib yang belum dipetakan. */
  missingRequired: string[];
  /** Field yang bila kosong memblokir commit untuk jenis laporan ini. */
  missingBlocking: string[];
  /** Target pemetaan yang bukan field jenis laporan ini. */
  unknownFields: string[];
  /** Dua field berbeda diarahkan ke kolom sumber yang sama (ambigu). */
  duplicateTargets: string[];
  /** Nama header kolom yang tidak ada/ganda di berkas. */
  badHeaders: string[];
  /** Kolom berkas yang belum dipetakan (informasi, bukan galat). */
  unmappedHeaders: string[];
  /** Kolom wajib hilang saat profil dipakai ulang. */
  needsUpdate: boolean;
};

function headerCounts(headers: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of headers) {
    const k = normalizeHeader(h);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function validateMapping(report: ReportTypeDef, headers: string[], mapping: ColumnMap): MappingValidation {
  const counts = headerCounts(headers);
  const fieldKeys = new Set(report.fields.map((f) => f.key));
  const missingRequired: string[] = [];
  const missingBlocking: string[] = [];
  const unknownFields: string[] = [];
  const badHeaders: string[] = [];
  const usedByHeader = new Map<string, string[]>();

  for (const [field, header] of Object.entries(mapping)) {
    if (!fieldKeys.has(field)) { unknownFields.push(field); continue; }
    if (!header) continue;
    const k = normalizeHeader(header);
    if (!k || (counts.get(k) ?? 0) !== 1) { badHeaders.push(header); continue; }
    usedByHeader.set(k, [...(usedByHeader.get(k) ?? []), field]);
  }
  const duplicateTargets = [...usedByHeader.entries()].filter(([, fs]) => new Set(fs).size > 1).map(([h]) => h);
  for (const f of report.fields) {
    if (f.fromContext) continue;
    const mapped = Boolean(mapping[f.key]);
    if (f.required && !mapped) missingRequired.push(f.key);
    if (report.blockingWhenMissing?.includes(f.key) && !mapped) missingBlocking.push(f.key);
  }
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean).map(normalizeHeader));
  const unmappedHeaders = headers.filter((h) => normalizeHeader(h) && !mappedHeaders.has(normalizeHeader(h)));
  return {
    ok: missingRequired.length === 0 && missingBlocking.length === 0 && duplicateTargets.length === 0 && badHeaders.length === 0,
    missingRequired,
    missingBlocking,
    unknownFields,
    duplicateTargets,
    badHeaders,
    unmappedHeaders,
    needsUpdate: missingRequired.length > 0 || missingBlocking.length > 0 || badHeaders.length > 0,
  };
}

/** Kolom sumber yang dipakai oleh sebuah field (hanya satu — tanpa agregasi implisit). */
export function columnIndex(headers: string[], header: string | undefined): number | undefined {
  if (!header) return undefined;
  const k = normalizeHeader(header);
  let found: number | undefined;
  headers.forEach((h, i) => {
    if (normalizeHeader(h) === k) found = found === undefined ? i : found;
  });
  return found;
}

/**
 * Rencana kolom: indeks kolom tiap field, dihitung SEKALI per berkas (R17 §2.2b).
 *
 * Sebelumnya `normalizeMappedRow` memanggil `columnIndex` untuk setiap field pada
 * setiap baris — artinya `normalizeHeader` dijalankan (jumlah field × jumlah kolom)
 * kali per baris. Pada 50.000 baris itu puluhan juta operasi string, dan profil R16
 * mencatat normalisasi 14,5 dtk. Rencana ini membuat biayanya O(field × kolom) per
 * BERKAS, bukan per baris. Hasil normalisasi tidak berubah sama sekali.
 */
export type ColumnPlan = Map<string, number | undefined>;

export function buildColumnPlan(report: ReportTypeDef, headers: string[], mapping: ColumnMap): ColumnPlan {
  const plan: ColumnPlan = new Map();
  for (const field of report.fields) {
    if (field.fromContext) continue;
    plan.set(field.key, columnIndex(headers, mapping[field.key]));
  }
  return plan;
}

export type MappedRow = {
  rowNo: number;
  values: Record<string, string>;
  masked: Record<string, string>;
  numbers: Record<string, bigint | null>;
  dates: Record<string, string | null>;
  status: RowStatus;
  code?: string;
  params?: Record<string, string | number>;
  warnings: string[];
  /** Kunci alami baris tanpa nomor urut (dipakai untuk idempotensi). */
  keyBase: string;
};

const EMPTY = new Set(["", "-", "n/a", "na", "null", "nil", "tidak ada"]);
const isBlank = (v: string | undefined) => v === undefined || EMPTY.has(v.trim().toLowerCase());

/** Kunci alami: field kunci yang benar-benar ada di berkas, DINORMALKAN, tanpa hash berkas. */
export function naturalKeyBase(report: ReportTypeDef, values: Record<string, string>): string {
  const parts = report.keyFields
    .map((f) => normalizeHeader(values[f] ?? ""))
    .filter((p) => p.length > 0);
  return `${report.key}:${parts.join("|")}`;
}

/** Kunci baris final = kunci alami + indeks kemunculan (stabil saat berkas diunggah ulang). */
export function rowKey(keyBase: string, occurrence: number): string {
  return occurrence > 0 ? `${keyBase}#${occurrence}` : keyBase;
}

/**
 * Indeks kemunculan HANYA dipakai untuk baris bank: dua mutasi sah bertanggal dan
 * bernominal sama boleh sama-sama ada, dan indeksnya stabil saat berkas diunggah ulang.
 * Untuk marketplace, kunci yang sama dua kali di satu berkas berarti DUPLIKAT nyata.
 */
export function keyWithOccurrence(domain: string, keyBase: string, occurrence: number): string {
  return domain === "bank" ? rowKey(keyBase, occurrence) : keyBase;
}

/**
 * Normalisasi satu baris hasil pemetaan pengguna. Tidak ada nilai yang dikarang:
 * nominal/tanggal yang tak terbaca menjadi `null` + peringatan, dan status baris
 * ditentukan di sini (satu sumber kebenaran untuk UI pratinjau & commit).
 */
export function normalizeMappedRow(
  report: ReportTypeDef,
  headers: string[],
  row: string[],
  rowNo: number,
  mapping: ColumnMap,
  opts: ParsingOptions,
  /** Bila diberikan, indeks kolom tidak dihitung ulang per baris (lihat `ColumnPlan`). */
  plan?: ColumnPlan,
): MappedRow {
  const values: Record<string, string> = {};
  const masked: Record<string, string> = {};
  const numbers: Record<string, bigint | null> = {};
  const dates: Record<string, string | null> = {};
  const warnings: string[] = [];

  for (const field of report.fields) {
    if (field.fromContext) continue;
    const idx = plan ? plan.get(field.key) : columnIndex(headers, mapping[field.key]);
    const raw = idx === undefined ? "" : (row[idx] ?? "").trim();
    values[field.key] = raw;
    masked[field.key] = maskPii(raw);
    if (field.type === "money") {
      const parsed = parseAmount(raw, { decimalHint: opts.decimalHint ?? "auto" });
      numbers[field.key] = parsed.minor;
      if (parsed.minor === null && !isBlank(raw)) warnings.push(`${field.key}: nominal tidak dikenali "${raw.slice(0, 24)}" → Belum diketahui`);
    } else if (field.type === "int") {
      const parsed = parseAmount(raw, { scale: 0 });
      numbers[field.key] = parsed.minor;
    } else if (field.type === "date") {
      const parsed = parseDate(applyDateFormat(raw, opts.dateFormat), { sourceTimeZone: opts.sourceTimeZone });
      dates[field.key] = parsed.date;
      if (parsed.date === null && !isBlank(raw)) warnings.push(`${field.key}: ${parsed.reason ?? "tanggal kosong"} → tidak diisi`);
    }
  }

  let status: RowStatus = "VALID";
  let code: string | undefined;
  const missingBlocking = (report.blockingWhenMissing ?? []).filter((f) => isBlank(values[f]));
  const blockingDate = report.fields.find((f) => f.type === "date" && f.required && !dates[f.key]);
  if (missingBlocking.length > 0) {
    status = "NEEDS_MAPPING";
    code = "missing_required_field";
  } else if (blockingDate) {
    status = "INVALID";
    code = "missing_date";
  } else if (warnings.length > 0) {
    status = "WARNING";
  }
  return { rowNo, values, masked, numbers, dates, status, code, params: { row: rowNo }, warnings, keyBase: naturalKeyBase(report, values) };
}

/** Nilai bertanda untuk baris bank mengikuti aturan arah yang DIKONFIRMASI pengguna. */
export function bankSignedAmount(
  row: MappedRow,
  rule: ParsingOptions["amountRule"],
): { minor: bigint | null; code?: string } {
  const debit = row.numbers.debit_amount ?? null;
  const credit = row.numbers.credit_amount ?? null;
  const signed = row.numbers.signed_amount ?? null;
  const abs = (v: bigint) => (v < 0n ? -v : v);
  if (rule === "debit_credit") {
    if (debit !== null && debit !== 0n) return { minor: -abs(debit) };
    if (credit !== null && credit !== 0n) return { minor: abs(credit) };
    return { minor: null };
  }
  if (rule === "signed") {
    if (signed === null) return { minor: null };
    return { minor: signed };
  }
  return { minor: null, code: "amount_rule_not_confirmed" };
}

/** Tanggal pengikat baris bank: transaksi → posting → valuta (urutan tetap). */
export function bankRowDate(row: MappedRow): string | null {
  return row.dates.transaction_date ?? row.dates.posting_date ?? row.dates.value_date ?? null;
}

/** Tanggal pengikat baris marketplace sesuai jenis laporan. */
export function marketplaceRowDate(report: ReportTypeDef, row: MappedRow): string | null {
  if (report.key === "orders_header" || report.key === "orders_items") return row.dates.order_date ?? null;
  if (report.key === "settlement_summary") return row.dates.statement_date ?? row.dates.statement_period_end ?? row.dates.statement_period_start ?? null;
  return row.dates.statement_period_end ?? row.dates.statement_date ?? row.dates.order_date ?? null;
}

/** Tanggal eksplisit: atur ulang bagian agar `parseDate` menerima format yang dipilih. */
export function applyDateFormat(raw: string, format: ParsingOptions["dateFormat"]): string {
  if (!format || format === "auto") return raw;
  const m = /^\s*(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(.*)$/.exec(raw);
  if (!m) return raw;
  const [, a, b, c] = m;
  if (a.length === 4) return raw; // ISO tidak diubah
  const head = format === "mdy" ? `${c}-${a}-${b}` : `${c}-${b}-${a}`;
  return `${head}${raw.slice(m[0].length - (m[4]?.length ?? 0))}`;
}
