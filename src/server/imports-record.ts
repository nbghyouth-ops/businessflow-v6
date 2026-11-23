/**
 * Mesin pencatatan impor generik — INSPECT & PRATINJAU (R11-A; dipecah untuk job
 * langkah-kecil R15 §2.1).
 *
 * Menggantikan jalur pengenalan otomatis: tidak ada tebakan template, tidak ada
 * alias header provider, tidak ada hash berkas. Pengguna memilih jenis laporan,
 * sheet, baris header, dan pemetaan kolomnya sendiri.
 *
 * `buildPreview` TIDAK menulis baris produksi apa pun (dijamin tes hitungan baris).
 * Pekerjaannya dipecah menjadi: baca+validasi (`parsePreviewSource`) → normalisasi
 * per potongan (`preparePreviewChunk`) → ringkasan (`summarizePreview`), sehingga
 * jalur job dapat menghasilkan hasil yang SAMA tanpa menahan event loop.
 */
import { sql } from "drizzle-orm";
import {
  FileValidationError,
  formulaCellsInMappedColumns,
  gridFromHeader,
  headerCandidates,
  parseWorkbook,
  type Grid,
  type ParsedWorkbook,
} from "@/features/imports/parser";
import { REPORT_TYPES, reportType, type ReportTypeDef } from "@/features/imports/canonical-fields";
import {
  bankRowDate,
  bankSignedAmount,
  buildColumnPlan,
  keyWithOccurrence,
  marketplaceRowDate,
  normalizeMappedRow,
  validateMapping,
  type ColumnMap,
  type MappedRow,
  type MappingValidation,
  type ParsingOptions,
} from "@/features/imports/mapping-engine";
import { matchProfile, type ProfileSnapshot } from "@/features/imports/profiles";
import { WRITABLE_ROW_STATUSES, type RowStatus } from "@/features/imports/state";
import type { DB, Tx } from "./core";

export const MAX_ROWS = 50_000;
export const PREVIEW_SAMPLE = 200;

/** Jenis laporan yang sudah punya tabel tujuan di putaran ini (sisanya pratinjau). */
export const TARGET_TABLE: Record<string, string> = {
  orders_header: "marketplace_orders",
  orders_items: "marketplace_order_items",
  settlement_summary: "marketplace_settlement_summaries",
  settlement_lines: "marketplace_settlement_lines",
  bank_lines: "bank_statement_lines",
};
export const WRITABLE_REPORT_TYPES = new Set(Object.keys(TARGET_TABLE));

export type UploadInput = { filename: string; text?: string; base64?: string; bytes?: Uint8Array };

export function bytesOf(input: { text?: string; base64?: string; bytes?: Uint8Array }): Uint8Array {
  // Jalur job sudah memegang byte asli: jangan encode/decode base64 hanya untuk itu.
  if (input.bytes && input.bytes.length > 0) return input.bytes;
  if (input.base64 && input.base64.trim()) return new Uint8Array(Buffer.from(input.base64, "base64"));
  if (input.text !== undefined) return new TextEncoder().encode(input.text);
  throw new FileValidationError("FILE_VALIDATION_FAILED", "Isi berkas tidak dikirim.");
}

export type InspectResult = {
  format: "csv" | "xlsx";
  encoding?: string;
  delimiter?: string;
  sheets: Array<{ name: string; hidden: boolean; rowCount: number; suggestedHeaderRow: number; preview: string[][] }>;
  warnings: string[];
};

/** Langkah 5–6 wizard: baca struktur berkas saja (tanpa menulis apa pun). */
export async function inspectUpload(input: UploadInput): Promise<InspectResult> {
  const wb: ParsedWorkbook = await parseWorkbook(bytesOf(input), input.filename);
  return {
    format: wb.format,
    encoding: wb.encoding,
    delimiter: wb.delimiter,
    warnings: wb.warnings,
    sheets: wb.sheets.map((g) => ({
      name: g.name,
      hidden: g.hidden,
      rowCount: g.rows.length,
      suggestedHeaderRow: headerCandidates(g.rows)[0]?.index ?? 0,
      preview: g.rows.slice(0, 10),
    })),
  };
}

export type PreviewInput = {
  reportType: string;
  providerCode?: string;
  providerLabel?: string;
  sourceLabel?: string;
  /** Alias rekening bank terdaftar (konteks, bukan sumber tebakan). */
  bankAliasId?: string;
  filename: string;
  sheetName: string;
  headerRow: number;
  mapping: ColumnMap;
  parsing: ParsingOptions;
  text?: string;
  base64?: string;
  /** Byte asli (dipakai pekerja job; menghindari encode/decode base64). */
  bytes?: Uint8Array;
  profileId?: string;
  profileVersion?: number;
};

export type PreviewRow = {
  rowNo: number;
  status: RowStatus;
  code?: string;
  params?: Record<string, string | number>;
  masked: Record<string, string>;
  numbers: Record<string, string | null>;
  dates: Record<string, string | null>;
  key: string;
  warnings: string[];
};

export type PreviewResult = {
  reportType: { key: string; label: string; domain: string; rowGrain: string };
  provider: string | null;
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: MappingValidation;
  profile: { id: string; version: number; status: string; ok: boolean; reason?: string } | null;
  writable: boolean;
  targetTable: string | null;
  statusTotal: number;
  summary: {
    totalRows: number;
    valid: number;
    warning: number;
    needsMapping: number;
    invalid: number;
    duplicates: number;
    potentialDuplicates: number;
    totalMinorByCurrency: Record<string, string>;
  };
  rows: PreviewRow[];
  warnings: string[];
};

/**
 * Kunci yang sudah TERBIT di DB untuk jenis laporan ini (dedupe kunci alami, tanpa hash).
 * Hanya kunci yang ditanyakan yang dibaca, sehingga satu potongan kecil tidak menarik
 * seluruh tabel (dan tidak menahan event loop). Baris milik job yang belum selesai tidak
 * dianggap "sudah ada" karena `published_at` masih null.
 */
async function existingKeys(tx: Tx | DB, workspaceId: string, reportKey: string, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const table = TARGET_TABLE[reportKey];
  if (!table || keys.length === 0) return out;
  const res = await tx.execute(sql`
    select source_key as k from ${sql.raw(table)}
    where workspace_id = ${workspaceId} and source_key is not null and published_at is not null
      and source_key in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
  for (const r of res.rows as Array<{ k: string | null }>) if (r.k) out.add(r.k);
  return out;
}

/** Jumlah baris per potongan saat meringkas pratinjau (menjaga satu langkah < 200 ms). */
const SUMMARY_CHUNK = 500;

const yieldTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function reportOf(key: string): ReportTypeDef {
  const report = reportType(key);
  if (!report) throw Object.assign(new Error("Jenis laporan impor tidak dikenal."), { code: "bad_report_type" });
  return report;
}

/** Hasil baca+validasi pratinjau (tanpa normalisasi baris). */
export type PreviewSource = {
  report: ReportTypeDef;
  grid: Grid;
  headers: string[];
  dataRows: string[][];
  mapping: MappingValidation;
  profile: PreviewResult["profile"];
  warnings: string[];
};

/** Langkah 5–9 wizard: baca berkas, pilih sheet/header, validasi pemetaan & formula. */
export async function parsePreviewSource(tx: Tx | DB, workspaceId: string, input: PreviewInput): Promise<PreviewSource> {
  const report = reportOf(input.reportType);
  const wb = await parseWorkbook(bytesOf(input), input.filename);
  const grid = wb.sheets.find((g) => g.name === input.sheetName) ?? wb.sheets[0];
  if (!grid) throw new FileValidationError("STRUCTURE_INVALID", "Sheet yang dipilih tidak ada di berkas.");
  const { headers, dataRows } = gridFromHeader(grid.rows, input.headerRow);
  if (headers.length === 0) throw new FileValidationError("STRUCTURE_INVALID", "Baris header yang dipilih tidak berisi kolom.");

  const mapping = validateMapping(report, headers, input.mapping);
  // Sel berformula: nilai cache TIDAK dianggap mutakhir (prompt AL-1). Bila kolom
  // yang berformula dipetakan ke field transaksi, impor ditolak dengan pesan jelas
  // alih-alih mencatat angka yang mungkin basi.
  const formulaInMapped = formulaCellsInMappedColumns(grid, input.headerRow, headers, input.mapping);
  if (formulaInMapped.length > 0) {
    throw new FileValidationError(
      "FORMULA_IN_MAPPED_COLUMN",
      `${formulaInMapped.length} sel berformula berada di kolom yang dipetakan (contoh baris ${formulaInMapped[0]}). Hapus formula atau petakan kolom tanpa formula.`,
    );
  }
  const warnings = [...wb.warnings];

  let profile: PreviewSource["profile"] = null;
  if (input.profileId) {
    const snapshot = await loadProfileSnapshot(tx, workspaceId, input.profileId, input.profileVersion);
    if (snapshot) {
      const m = matchProfile(report, snapshot.snapshot, { sheetName: grid.name, headers, parseable: headers.length > 0 });
      profile = { id: snapshot.id, version: snapshot.version, status: m.status, ok: m.ok, reason: m.reason };
      if (!m.ok) warnings.push("Struktur sumber berubah atau tidak cocok: periksa pemetaan sebelum melanjutkan.");
    }
  }

  if (dataRows.length > MAX_ROWS) warnings.push(`berkas melebihi batas sinkron ${MAX_ROWS} baris; sisa tidak diproses`);
  return { report, grid, headers, dataRows: dataRows.slice(0, MAX_ROWS), mapping, profile, warnings };
}

export type PreparedPreviewRow = { row: MappedRow; key: string; status: RowStatus; code?: string };

/**
 * Normalisasi baris [from, to) menjadi baris pratinjau berstatus.
 * `occurrence` dibawa lintas potongan supaya kunci alami stabil (dan dapat diputar
 * ulang saat job dilanjutkan).
 */
export function preparePreviewChunk(
  source: PreviewSource,
  input: Pick<PreviewInput, "headerRow" | "mapping" | "parsing">,
  from: number,
  to: number,
  occurrence: Map<string, number>,
  out: PreparedPreviewRow[],
): void {
  const report = source.report;
  const upper = Math.min(to, source.dataRows.length);
  // Rencana kolom per potongan, bukan per baris (R17 §2.2b).
  const plan = buildColumnPlan(report, source.headers, input.mapping);
  for (let i = from; i < upper; i++) {
    const raw = source.dataRows[i];
    const mapped = normalizeMappedRow(report, source.headers, raw, i + input.headerRow + 2, input.mapping, input.parsing, plan);
    let status = mapped.status;
    let code = mapped.code;
    if (report.domain === "bank") {
      const signed = bankSignedAmount(mapped, input.parsing.amountRule);
      if (signed.code) { status = "NEEDS_MAPPING"; code = signed.code; }
      else if (bankRowDate(mapped) === null) { status = "INVALID"; code = "missing_date"; }
      else if (signed.minor === null) { status = "INVALID"; code = "missing_amount"; }
      else if (!mapped.values.reference_raw && mapped.numbers.running_balance === null) { status = "WARNING"; code = "potential_duplicate_risk"; }
    } else if (report.requiresDate && marketplaceRowDate(report, mapped) === null && status !== "NEEDS_MAPPING") {
      status = "INVALID"; code = "missing_date";
    }
    const n = occurrence.get(mapped.keyBase) ?? 0;
    occurrence.set(mapped.keyBase, n + 1);
    out.push({ row: mapped, key: keyWithOccurrence(report.domain, mapped.keyBase, n), status, code });
  }
}

/** Ringkasan pratinjau: cek duplikat terhadap baris TERBIT, hitung status + total. */
export async function summarizePreview(
  tx: Tx | DB,
  workspaceId: string,
  source: PreviewSource,
  input: Pick<PreviewInput, "providerCode" | "parsing" | "headerRow">,
  prepared: PreparedPreviewRow[],
): Promise<PreviewResult> {
  const report = source.report;
  // Cek duplikat per potongan (bukan satu kueri raksasa di akhir): langkah tetap kecil.
  const seen = new Set<string>();
  for (let i = 0; i < prepared.length; i += SUMMARY_CHUNK) {
    const slice = prepared.slice(i, i + SUMMARY_CHUNK).map((p) => p.key);
    const found = await existingKeys(tx, workspaceId, report.key, slice);
    for (const k of found) seen.add(k);
    await yieldTick();
  }
  const inFile = new Set<string>();
  const previewRows: PreviewRow[] = [];
  let valid = 0, warning = 0, needsMapping = 0, invalid = 0, duplicates = 0, potential = 0;
  const totalByCurrency = new Map<string, bigint>();

  for (const [index, p] of prepared.entries()) {
    if (index > 0 && index % SUMMARY_CHUNK === 0) await yieldTick();
    let status = p.status;
    let code = p.code;
    if (seen.has(p.key) || inFile.has(p.key)) { status = "DUPLICATE"; code = "duplicate_source_key"; }
    inFile.add(p.key);
    if (status === "VALID") valid += 1;
    else if (status === "WARNING") { warning += 1; if (code === "potential_duplicate_risk") potential += 1; }
    else if (status === "NEEDS_MAPPING") needsMapping += 1;
    else if (status === "DUPLICATE") duplicates += 1;
    else invalid += 1;

    const amount = report.domain === "bank"
      ? bankSignedAmount(p.row, input.parsing.amountRule).minor
      : (p.row.numbers.total_settlement ?? p.row.numbers.order_gross_amount ?? p.row.numbers.settlement_line_amount ?? null);
    if (amount !== null && (status === "VALID" || status === "WARNING")) {
      const currency = (p.row.values.currency_code || p.row.values.line_currency_code || input.parsing.currencyCode || "?").toUpperCase();
      totalByCurrency.set(currency, (totalByCurrency.get(currency) ?? 0n) + amount);
    }
    if (previewRows.length < PREVIEW_SAMPLE) {
      previewRows.push({
        rowNo: p.row.rowNo,
        status,
        code,
        params: p.row.params,
        masked: p.row.masked,
        numbers: Object.fromEntries(Object.entries(p.row.numbers).map(([k, v]) => [k, v === null ? null : v.toString()])),
        dates: p.row.dates,
        key: p.key,
        warnings: p.row.warnings,
      });
    }
  }

  return {
    reportType: { key: report.key, label: report.label, domain: report.domain, rowGrain: report.rowGrain },
    provider: input.providerCode ?? null,
    sheetName: source.grid.name,
    headerRow: input.headerRow,
    headers: source.headers,
    mapping: source.mapping,
    profile: source.profile,
    writable: WRITABLE_REPORT_TYPES.has(report.key),
    targetTable: TARGET_TABLE[report.key] ?? null,
    // Invarian tanpa-diam-diam: setiap baris berakhir di tepat satu status.
    statusTotal: valid + warning + needsMapping + invalid + duplicates,
    summary: {
      totalRows: prepared.length,
      valid, warning, needsMapping, invalid, duplicates,
      potentialDuplicates: potential,
      totalMinorByCurrency: Object.fromEntries([...totalByCurrency].map(([c, v]) => [c, v.toString()])),
    },
    rows: previewRows,
    warnings: source.warnings,
  };
}

/** Pratinjau kering satu langkah: nol tulis produksi; baris invalid TIDAK dihilangkan. */
export async function buildPreview(tx: Tx | DB, workspaceId: string, input: PreviewInput): Promise<PreviewResult> {
  const source = await parsePreviewSource(tx, workspaceId, input);
  const prepared: PreparedPreviewRow[] = [];
  preparePreviewChunk(source, input, 0, source.dataRows.length, new Map(), prepared);
  return summarizePreview(tx, workspaceId, source, input, prepared);
}

/** Ambil snapshot versi profil (immutable) untuk validasi ulang. */
export async function loadProfileSnapshot(
  tx: Tx | DB,
  workspaceId: string,
  profileId: string,
  version?: number,
): Promise<{ id: string; version: number; snapshot: ProfileSnapshot } | null> {
  const res = await tx.execute(sql`
    select p.id, p.current_version as "currentVersion",
      v.version, v.sheet_name as "sheetName", v.header_row as "headerRow", v.mapping, v.parsing
    from import_mapping_profiles p
    join import_mapping_profile_versions v on v.workspace_id = p.workspace_id and v.profile_id = p.id
    where p.workspace_id = ${workspaceId} and p.id = ${profileId}
      and v.version = coalesce(${version ?? null}::int, p.current_version)
    limit 1`);
  const row = res.rows[0] as
    | { id: string; version: number; sheetName: string | null; headerRow: number; mapping: ColumnMap; parsing: ParsingOptions }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    snapshot: { sheetName: row.sheetName, headerRow: row.headerRow ?? 0, mapping: row.mapping ?? {}, parsing: row.parsing ?? { sourceTimeZone: "UTC" } },
  };
}

export const REPORT_CATALOG = REPORT_TYPES.map((r) => ({
  key: r.key,
  label: r.label,
  domain: r.domain,
  rowGrain: r.rowGrain,
  writable: WRITABLE_REPORT_TYPES.has(r.key),
  fields: r.fields.map((f) => ({ key: f.key, label: f.label, help: f.help, type: f.type, required: Boolean(f.required) })),
}));

export { WRITABLE_ROW_STATUSES };
