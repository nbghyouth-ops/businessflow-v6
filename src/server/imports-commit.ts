/**
 * Mesin pencatatan impor generik — COMMIT (R11-A, dipecah untuk job langkah-kecil R15 §2.1).
 *
 * Jaminan: atomik per batch (commit sinkron = satu transaksi), idempoten (kunci alami
 * `source_key` tanpa hash berkas), tanpa tebakan (NULL tetap NULL; biaya dari berkas apa
 * adanya), tanpa double counting (baris bank tidak otomatis menjadi pendapatan/biaya).
 *
 * Sejak 022, baris hasil impor punya `published_at`:
 *  - commit sinkron menerbitkan barisnya dalam transaksi yang sama (atomik);
 *  - job langkah-kecil menerbitkan HANYA pada langkah penutup, sehingga job yang
 *    dibatalkan/mati di tengah tak pernah menampilkan data setengah jadi.
 */
import { sql } from "drizzle-orm";
import { formatMinor } from "@/lib/imports/money";
import { formulaCellsInMappedColumns, gridFromHeader, parseWorkbook } from "@/features/imports/parser";
import { reportType, type ReportTypeDef } from "@/features/imports/canonical-fields";
import {
  bankRowDate,
  bankSignedAmount,
  buildColumnPlan,
  keyWithOccurrence,
  marketplaceRowDate,
  normalizeMappedRow,
  validateMapping,
  type ColumnMap,
  type ColumnPlan,
  type MappedRow,
  type ParsingOptions,
} from "@/features/imports/mapping-engine";
import { addCounters, EMPTY_COUNTERS, type RowCounters } from "@/features/imports/jobs";
import { audit, HttpError, type Ctx, type Tx } from "./core";
import { MAX_ROWS, WRITABLE_REPORT_TYPES, bytesOf } from "./imports-record";

export type CommitInput = {
  reportType: string;
  providerCode?: string;
  providerLabel?: string;
  filename: string;
  sheetName: string;
  headerRow: number;
  mapping: ColumnMap;
  parsing: ParsingOptions;
  channelId?: string;
  cashAccountId?: string;
  /** Alias rekening bank terdaftar (label + maksimal 4 digit terakhir). */
  bankAliasId?: string;
  sourceLabel?: string;
  text?: string;
  base64?: string;
  /** Byte asli (dipakai pekerja job; menghindari encode/decode base64). */
  bytes?: Uint8Array;
  profileId?: string;
  profileVersion?: number;
};

export type CommitResult = {
  batchId: string;
  status: "committed";
  reportType: string;
  provider: string | null;
  inserted: number;
  duplicates: number;
  invalid: number;
  skipped: number;
  /** Invarian tanpa-diam-diam: inserted + duplicates + invalid + skipped = total baris. */
  statusTotal: number;
  totalRows: number;
  statementId?: string;
  totalMinorByCurrency: Record<string, string>;
};

/** Hasil membaca berkas untuk commit: sudah divalidasi (pemetaan + formula). */
export type CommitSource = {
  report: ReportTypeDef;
  sheetName: string;
  headers: string[];
  dataRows: string[][];
  warnings: string[];
};

/** Persiapan yang dipakai bersama oleh potongan-potongan job. */
export type PreparedCommit = {
  batchId: string;
  channelId: string | null;
  statementId: string | null;
  headers: string[];
  dataRows: string[][];
  total: number;
  /** Jenis laporan yang dipakai untuk normalisasi baris (satu sumber dengan pratinjau). */
  report: ReportTypeDef;
  domain: string;
  /** Indeks kolom per field, dihitung sekali untuk seluruh berkas (R17 §2.2b). */
  plan: ColumnPlan;
};

/** Kolom BIGINT unit minor menyimpan bilangan bulat — tanpa pembulatan float. */
const intOrNull = (v: bigint | null): string | null => (v === null ? null : v.toString());
const clampPos = (v: bigint | null): string => {
  if (v === null) return "0";
  return v < 0n ? "0" : formatMinor(v);
};
const abs = (v: bigint) => (v < 0n ? -v : v);

/** Status kanonik dari status mentah sumber; tak dikenal → `unknown` (perlu tinjauan). */
export function orderStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (/cancel|batal|dibatalkan/.test(s)) return "cancelled";
  if (/settle|selesai|completed|done/.test(s)) return "settled";
  if (/kirim|shipped|shipping|dalam perjalanan/.test(s)) return "shipped";
  if (/pending|belum|menunggu|unpaid/.test(s)) return "pending";
  if (/paid|dibayar|lunas|diproses|processing/.test(s)) return "paid";
  return "unknown";
}

async function resolveChannel(tx: Tx, ctx: Ctx, input: CommitInput): Promise<string> {
  if (input.channelId) {
    const res = await tx.execute(sql`select id from marketplace_channels where workspace_id = ${ctx.workspaceId} and id = ${input.channelId} limit 1`);
    if (res.rows.length > 0) return (res.rows[0] as { id: string }).id;
    throw new HttpError(422, "Kanal marketplace yang dipilih tidak ada di workspace ini.", "channel_not_found");
  }
  const label = (input.providerLabel || input.providerCode || "Lainnya").trim().slice(0, 80);
  const found = await tx.execute(sql`select id from marketplace_channels where workspace_id = ${ctx.workspaceId} and lower(name) = lower(${label}) limit 1`);
  if (found.rows.length > 0) return (found.rows[0] as { id: string }).id;
  const created = await tx.execute(sql`
    insert into marketplace_channels (workspace_id, business_id, name, kind)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${label}, 'manual') returning id`);
  return (created.rows[0] as { id: string }).id;
}

/**
 * Baca + validasi berkas sebelum apa pun ditulis. Dipakai jalur sinkron maupun job,
 * sehingga aturan (pemetaan wajib, formula di kolom terpetakan ditolak, batas baris)
 * tidak bisa berbeda antar-jalur.
 */
export async function loadCommitSource(input: CommitInput): Promise<CommitSource> {
  const report = reportType(input.reportType);
  if (!report) throw new HttpError(422, "Jenis laporan impor tidak dikenal.", "bad_report_type");
  if (!WRITABLE_REPORT_TYPES.has(report.key)) {
    throw new HttpError(422, "Jenis laporan impor ini belum punya tabel tujuan.", "target_not_available");
  }
  // Arah nominal bank yang belum dipilih pengguna MEMBLOKIR commit (tidak ditebak dari tanda).
  if (report.domain === "bank" && input.parsing.amountRule !== "debit_credit" && input.parsing.amountRule !== "signed") {
    throw new HttpError(422, "Arah nominal bank (kolom debit/kredit terpisah atau satu kolom bertanda) belum dikonfirmasi.", "amount_rule_not_confirmed");
  }
  const bytes = bytesOf(input);
  const wb = await parseWorkbook(bytes, input.filename);
  const grid = wb.sheets.find((g) => g.name === input.sheetName) ?? wb.sheets[0];
  if (!grid) throw new HttpError(422, "Sheet yang dipilih tidak ada di berkas.", "STRUCTURE_INVALID");
  const { headers, dataRows } = gridFromHeader(grid.rows, input.headerRow);
  if (headers.length === 0) throw new HttpError(422, "Baris header yang dipilih tidak berisi kolom.", "STRUCTURE_INVALID");
  const check = validateMapping(report, headers, input.mapping);
  if (!check.ok) {
    throw new HttpError(422, "Pemetaan kolom belum lengkap: kolom wajib harus dipetakan dan unik.", "mapping_incomplete");
  }
  // Sel berformula pada kolom yang dipetakan: nilai cache tidak dianggap mutakhir.
  const formulaBlocked = formulaCellsInMappedColumns(grid, input.headerRow, headers, input.mapping);
  if (formulaBlocked.length > 0) {
    throw new HttpError(
      422,
      `${formulaBlocked.length} sel berformula berada di kolom yang dipetakan (contoh baris ${formulaBlocked[0]}). Hapus formula atau petakan kolom tanpa formula.`,
      "FORMULA_IN_MAPPED_COLUMN",
    );
  }
  if (dataRows.length === 0) throw new HttpError(422, "Berkas tidak berisi baris data pada sheet ini.", "empty_file");
  if (dataRows.length > MAX_ROWS) throw new HttpError(422, `Berkas melebihi batas ${MAX_ROWS} baris.`, "too_many_rows");
  return { report, sheetName: grid.name, headers, dataRows, warnings: wb.warnings };
}

/** Buat batch + (bila bank) statement, plus resolusi kanal/alias. Belum menulis baris data. */
export async function prepareCommit(
  tx: Tx,
  ctx: Ctx,
  input: CommitInput,
  source: Pick<CommitSource, "report" | "sheetName" | "headers" | "dataRows">,
): Promise<PreparedCommit> {
  const report = source.report;
  const needChannel = report.domain === "marketplace";
  const channelId = needChannel ? await resolveChannel(tx, ctx, input) : null;
  if (report.domain === "bank" && input.bankAliasId) {
    const alias = await tx.execute(sql`
      select id from bank_account_aliases where workspace_id = ${ctx.workspaceId} and id = ${input.bankAliasId} limit 1`);
    if (alias.rows.length === 0) {
      throw new HttpError(422, "Alias rekening bank yang dipilih tidak ada di workspace ini.", "bank_alias_not_found");
    }
  }
  const bytes = bytesOf(input);
  // Rencana kolom dihitung SEKALI di sini dan dipakai semua potongan commit.
  const plan = buildColumnPlan(report, source.headers, input.mapping);
  const [batch] = (
    await tx.execute(sql`
      insert into import_batches
        (workspace_id, target, filename, total_rows, status, template, template_version, file_size, dry_run,
         summary, provider_code, report_type, row_grain, source_label_id, mapping_profile_id, mapping_profile_version,
         user_options, sheet_name, header_row)
      values (${ctx.workspaceId}, ${report.key}, ${input.filename}, ${source.dataRows.length}, 'committing', ${report.key}, 'r11a-1',
        ${bytes.length}, false, ${JSON.stringify({ kind: report.key })}::jsonb, ${input.providerCode ?? null}, ${report.key}, ${report.rowGrain},
        ${channelId ?? input.bankAliasId ?? null}, ${input.profileId ?? null}, ${input.profileVersion ?? null},
        ${JSON.stringify(input.parsing ?? {})}::jsonb, ${source.sheetName}, ${input.headerRow})
      returning id`)
  ).rows as Array<{ id: string }>;

  let statementId: string | null = null;
  if (report.key === "bank_lines") {
    const dates = source.dataRows
      .map((raw, i) => normalizeMappedRow(report, source.headers, raw, i + 2, input.mapping, input.parsing, plan))
      .map((r) => bankRowDate(r))
      .filter((d): d is string => Boolean(d))
      .sort();
    const [stmt] = (
      await tx.execute(sql`
        insert into bank_statements (workspace_id, business_id, cash_account_id, bank, account_last4, period_start, period_end, template, import_batch_id, bank_alias_id)
        values (${ctx.workspaceId}, ${ctx.businessId}, ${input.cashAccountId ?? null}, ${input.providerLabel || input.providerCode || "bank"},
          ${maskLast4(input.sourceLabel ?? null)}, ${dates[0] ?? null}, ${dates[dates.length - 1] ?? null}, ${report.key}, ${batch.id},
          ${input.bankAliasId ?? null})
        returning id`)
    ).rows as Array<{ id: string }>;
    statementId = stmt.id;
  }

  return {
    batchId: batch.id,
    channelId,
    statementId,
    headers: source.headers,
    dataRows: source.dataRows,
    total: source.dataRows.length,
    report,
    domain: report.domain,
    plan,
  };
}

/** Kunci alami lintas-potongan: kemunculan ke-n dari basis kunci yang sama. */
export type OccurrenceMap = Map<string, number>;

/**
 * Tulis baris [from, to) — satu transaksi milik pemanggil. Idempoten: kunci alami
 * yang sudah ada menjadi `duplicate`, bukan baris kedua.
 */
/**
 * Profil tahap commit (R16 §2.3). Diisi hanya bila `BF_PROFILE_STEPS=1`, sehingga
 * jalur produksi tidak membayar biaya pengukuran. Angka ini yang dipakai untuk
 * memutuskan optimasi — bukan dugaan.
 */
export type CommitProfile = { rows: number; normalizeMs: number; insertMs: number; journalMs: number };
const profile: CommitProfile = { rows: 0, normalizeMs: 0, insertMs: 0, journalMs: 0 };
const profEnabled = process.env.BF_PROFILE_STEPS === "1";
export function __commitProfile(): CommitProfile {
  return { ...profile };
}
export function __resetCommitProfile(): void {
  profile.rows = 0; profile.normalizeMs = 0; profile.insertMs = 0; profile.journalMs = 0;
}

/** Catatan baris (`import_rows`) dikumpulkan lalu ditulis SATU pernyataan per potongan. */
type JournalRow = { rowNo: number; status: string; code: string | null; sourceKey: string; targetTable: string | null; targetId: string | null };

async function recordRows(tx: Tx, ctx: Ctx, batchId: string, rows: JournalRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.map((r) => sql`(${ctx.workspaceId}, ${batchId}, ${r.rowNo}, ${r.status}, ${r.code}, ${JSON.stringify({ row: r.rowNo })}::jsonb, ${r.sourceKey}, ${r.targetTable}, ${r.targetId})`);
  for (let i = 0; i < values.length; i += 500) {
    await tx.execute(sql`
      insert into import_rows (workspace_id, batch_id, row_no, status, code, params, source_key, target_table, target_id)
      values ${sql.join(values.slice(i, i + 500), sql`, `)}`);
  }
}

const ORDERS_COLUMNS = sql.raw(`workspace_id, business_id, channel_id, order_no, occurred_on, gross_amount, discount, platform_fee, shipping_cost, net_amount,
  status, note, source_template, source_row, source_key, import_batch_id, external_order_ref,
  order_status_raw, purchase_channel, currency, buyer_reference_masked, order_updated_at`);

type PlannedOrderRow = { rowNo: number; key: string; amount: bigint | null; currency: string; values: unknown[] };

/** Baris per pernyataan INSERT multi-baris (dipilih dari pengukuran, bukan tebakan). */
export const ORDER_INSERT_BATCH = 250;

/**
 * Jalur cepat `orders_header`: satu INSERT multi-baris per potongan (R16 §2.3).
 *
 * Semantiknya SAMA dengan jalur per-baris: kunci alami `source_key` tetap idempoten
 * (`on conflict do nothing`), baris yang tidak kembali dari `returning` adalah duplikat,
 * tanggal wajib tetap menolak baris tanpa tanggal, dan jurnal baris tetap ditulis.
 * Bedanya hanya jumlah round-trip: 1 pernyataan untuk ±500 baris, bukan 500.
 */
async function commitOrdersBulk(
  tx: Tx,
  ctx: Ctx,
  input: CommitInput,
  prepared: PreparedCommit,
  from: number,
  upper: number,
  occurrence: OccurrenceMap,
  totalsByCurrency: Map<string, bigint>,
): Promise<RowCounters> {
  let counters: RowCounters = { ...EMPTY_COUNTERS };
  const journal: JournalRow[] = [];
  const planned: PlannedOrderRow[] = [];
  let normalizeMs = 0;
  for (let i = from; i < upper; i++) {
    const rowNo = i + input.headerRow + 2;
    const t0 = profEnabled ? performance.now() : 0;
    const row = normalizeMappedRow(prepared.report, prepared.headers, prepared.dataRows[i], rowNo, input.mapping, input.parsing, prepared.plan);
    if (profEnabled) normalizeMs += performance.now() - t0;
    const n = occurrence.get(row.keyBase) ?? 0;
    occurrence.set(row.keyBase, n + 1);
    const key = keyWithOccurrence(prepared.domain, row.keyBase, n);
    const date = marketplaceRowDate(prepared.report, row);
    if (!date && prepared.report.requiresDate) {
      journal.push({ rowNo, status: "invalid", code: "missing_date", sourceKey: key, targetTable: null, targetId: null });
      continue;
    }
    const gross = row.numbers.order_gross_amount ?? null;
    const discount = row.numbers.order_discount_total ?? null;
    const shipping = row.numbers.shipping_amount ?? null;
    const net = gross === null ? null : gross - (discount ?? 0n);
    planned.push({
      rowNo,
      key,
      amount: net,
      currency: (row.values.currency_code || input.parsing.currencyCode || "?").toUpperCase(),
      values: [
        ctx.workspaceId, ctx.businessId, prepared.channelId, row.values.external_order_id || "TANPA-NOMOR", date ?? null,
        clampPos(gross), clampPos(discount), clampPos(null), clampPos(shipping), clampPos(net),
        orderStatus(row.values.order_status_raw ?? ""),
        row.values.purchase_channel ? `Kanal pembelian: ${row.values.purchase_channel}` : null,
        prepared.report.key, rowNo, key, prepared.batchId, row.values.external_order_id || null,
        row.values.order_status_raw || null, row.values.purchase_channel || null,
        row.values.currency_code || input.parsing.currencyCode || null, row.masked.buyer_reference_masked || null,
        row.dates.order_updated_at ?? null,
      ],
    });
  }

  const insertedIds = new Map<string, string>();
  const t1 = profEnabled ? performance.now() : 0;
  // 250 baris per pernyataan: satu pernyataan 500 baris terukur 325 ms di mesin ini
  // (di atas anggaran "tidak ada langkah >200 ms"), sedangkan 250 baris tetap membuat
  // jumlah pernyataan jauh lebih sedikit daripada satu per baris.
  for (let i = 0; i < planned.length; i += ORDER_INSERT_BATCH) {
    const batch = planned.slice(i, i + ORDER_INSERT_BATCH);
    const tuples = batch.map((p) => sql`(${sql.join(p.values.map((v) => sql`${v}`), sql`, `)})`);
    const res = await tx.execute(sql`
      insert into marketplace_orders (${ORDERS_COLUMNS})
      values ${sql.join(tuples, sql`, `)}
      on conflict (workspace_id, source_key) where source_key is not null do nothing
      returning id, source_key`);
    for (const row of res.rows as Array<{ id: string; source_key: string }>) insertedIds.set(row.source_key, row.id);
  }
  const insertMs = profEnabled ? performance.now() - t1 : 0;

  for (const p of planned) {
    const id = insertedIds.get(p.key);
    if (!id) {
      counters = addCounters(counters, { duplicates: 1 });
      journal.push({ rowNo: p.rowNo, status: "duplicate", code: "duplicate_source_key", sourceKey: p.key, targetTable: "marketplace_orders", targetId: null });
      continue;
    }
    counters = addCounters(counters, { inserted: 1 });
    journal.push({ rowNo: p.rowNo, status: "inserted", code: null, sourceKey: p.key, targetTable: "marketplace_orders", targetId: id });
  }
  // Total per mata uang dihitung dari baris yang benar-benar TERCATAT pada potongan ini.
  for (const p of planned) {
    if (!insertedIds.has(p.key) || p.amount === null) continue;
    totalsByCurrency.set(p.currency, (totalsByCurrency.get(p.currency) ?? 0n) + p.amount);
  }

  const t2 = profEnabled ? performance.now() : 0;
  await recordRows(tx, ctx, prepared.batchId, journal);
  if (profEnabled) {
    profile.rows += upper - from;
    profile.normalizeMs += normalizeMs;
    profile.insertMs += insertMs;
    profile.journalMs += performance.now() - t2;
  }
  return counters;
}

export async function commitRowsChunk(
  tx: Tx,
  ctx: Ctx,
  input: CommitInput,
  prepared: PreparedCommit,
  from: number,
  to: number,
  occurrence: OccurrenceMap,
  totalsByCurrency: Map<string, bigint>,
): Promise<RowCounters> {
  if (prepared.report.key === "orders_header") {
    return commitOrdersBulk(tx, ctx, input, prepared, from, Math.min(to, prepared.dataRows.length), occurrence, totalsByCurrency);
  }
  let counters: RowCounters = { ...EMPTY_COUNTERS };
  const upper = Math.min(to, prepared.dataRows.length);
  const journal: JournalRow[] = [];
  let normalizeMs = 0;
  let insertMs = 0;
  for (let i = from; i < upper; i++) {
    const raw = prepared.dataRows[i];
    const rowNo = i + input.headerRow + 2;
    const t0 = profEnabled ? performance.now() : 0;
    const row = normalizeMappedRow(prepared.report, prepared.headers, raw, rowNo, input.mapping, input.parsing, prepared.plan);
    if (profEnabled) normalizeMs += performance.now() - t0;
    const n = occurrence.get(row.keyBase) ?? 0;
    occurrence.set(row.keyBase, n + 1);
    const key = keyWithOccurrence(prepared.domain, row.keyBase, n);

    const t1 = profEnabled ? performance.now() : 0;
    const outcome = await insertRow(tx, ctx, prepared.report, input, {
      row, key, channelId: prepared.channelId, statementId: prepared.statementId, batchId: prepared.batchId, rowNo, duplicateInBatch: n > 0,
    });
    if (profEnabled) insertMs += performance.now() - t1;
    if (outcome.kind === "invalid") {
      counters = addCounters(counters, { invalid: 1 });
      journal.push({ rowNo, status: "invalid", code: outcome.code ?? "invalid_row", sourceKey: key, targetTable: null, targetId: null });
      continue;
    }
    if (outcome.kind === "duplicate") {
      counters = addCounters(counters, { duplicates: 1 });
      journal.push({ rowNo, status: "duplicate", code: "duplicate_source_key", sourceKey: key, targetTable: outcome.table, targetId: null });
      continue;
    }
    counters = addCounters(counters, { inserted: 1 });
    if (outcome.amount !== null) {
      const currency = (row.values.currency_code || row.values.line_currency_code || input.parsing.currencyCode || "?").toUpperCase();
      totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0n) + outcome.amount);
    }
    journal.push({ rowNo, status: "inserted", code: null, sourceKey: key, targetTable: outcome.table, targetId: outcome.id ?? null });
  }
  const t2 = profEnabled ? performance.now() : 0;
  await recordRows(tx, ctx, prepared.batchId, journal);
  if (profEnabled) {
    profile.rows += upper - from;
    profile.normalizeMs += normalizeMs;
    profile.insertMs += insertMs;
    profile.journalMs += performance.now() - t2;
  }
  return counters;
}

/** Langkah penutup: tandai batch selesai, TERBITKAN barisnya, catat audit. */
export async function finalizeCommit(
  tx: Tx,
  ctx: Ctx,
  input: CommitInput,
  prepared: PreparedCommit,
  counters: RowCounters,
  totalsByCurrency: Map<string, bigint>,
): Promise<CommitResult> {
  const report = reportType(input.reportType)!;
  const { inserted, duplicates, invalid, skipped } = counters;
  await tx.execute(sql`
    update import_batches set status = ${invalid > 0 ? "committed_with_errors" : "committed"},
      imported_rows = ${inserted}, error_rows = ${invalid},
      summary = ${JSON.stringify({ inserted, duplicates, invalid, skipped, kind: report.key, totalMinorByCurrency: Object.fromEntries([...totalsByCurrency].map(([c, v]) => [c, v.toString()])) })}::jsonb,
      inserted_ids = '[]'::jsonb
    where workspace_id = ${ctx.workspaceId} and id = ${prepared.batchId}`);

  await publishBatchRows(tx, ctx, prepared);

  await audit(tx, ctx, "import.recording.commit", "import_batch", prepared.batchId, {
    reportType: report.key, provider: input.providerCode ?? null, inserted, duplicates, invalid,
  });

  const statusTotal = inserted + duplicates + invalid + skipped;
  return {
    batchId: prepared.batchId,
    status: "committed",
    reportType: report.key,
    provider: input.providerCode ?? null,
    inserted, duplicates, invalid, skipped,
    statusTotal,
    totalRows: prepared.total,
    statementId: prepared.statementId ?? undefined,
    totalMinorByCurrency: Object.fromEntries([...totalsByCurrency].map(([c, v]) => [c, v.toString()])),
  };
}

/** Terbitkan baris milik batch ini (idempoten). Hanya baris batch ini yang tersentuh. */
export async function publishBatchRows(tx: Tx, ctx: Ctx, prepared: Pick<PreparedCommit, "batchId" | "statementId">): Promise<void> {
  for (const table of [
    "marketplace_orders",
    "marketplace_order_items",
    "marketplace_settlement_summaries",
    "marketplace_settlement_lines",
  ]) {
    await tx.execute(sql`
      update ${sql.raw(table)} set published_at = now()
      where workspace_id = ${ctx.workspaceId} and import_batch_id = ${prepared.batchId} and published_at is null`);
  }
  if (prepared.statementId) {
    await tx.execute(sql`
      update bank_statement_lines set published_at = now()
      where workspace_id = ${ctx.workspaceId} and statement_id = ${prepared.statementId} and published_at is null`);
  }
}

/**
 * Batalkan batch yang belum diterbitkan: hapus barisnya (belum pernah terlihat siapa pun)
 * dan tandai batch CANCELLED dengan alasan. Baris yang sudah terbit TIDAK dihapus —
 * koreksinya lewat prosedur reversal, bukan DELETE.
 */
export async function cancelCommit(
  tx: Tx,
  ctx: Ctx,
  prepared: Pick<PreparedCommit, "batchId" | "statementId">,
  reason: string,
): Promise<void> {
  for (const table of [
    "marketplace_orders",
    "marketplace_order_items",
    "marketplace_settlement_summaries",
    "marketplace_settlement_lines",
  ]) {
    await tx.execute(sql`
      delete from ${sql.raw(table)}
      where workspace_id = ${ctx.workspaceId} and import_batch_id = ${prepared.batchId} and published_at is null`);
  }
  if (prepared.statementId) {
    await tx.execute(sql`
      delete from bank_statement_lines
      where workspace_id = ${ctx.workspaceId} and statement_id = ${prepared.statementId} and published_at is null`);
    await tx.execute(sql`delete from bank_statements where workspace_id = ${ctx.workspaceId} and id = ${prepared.statementId}`);
  }
  await tx.execute(sql`delete from import_rows where workspace_id = ${ctx.workspaceId} and batch_id = ${prepared.batchId}`);
  await tx.execute(sql`
    update import_batches set status = 'cancelled',
      summary = coalesce(summary, '{}'::jsonb) || ${JSON.stringify({ canceled: true, reason })}::jsonb
    where workspace_id = ${ctx.workspaceId} and id = ${prepared.batchId}`);
  await audit(tx, ctx, "import.recording.cancel", "import_batch", prepared.batchId, { reason });
}

/** Jalur sinkron (berkas kecil): baca → siapkan → tulis semua → terbitkan, dalam satu transaksi. */
export async function commitRecording(tx: Tx, ctx: Ctx, input: CommitInput): Promise<CommitResult> {
  const source = await loadCommitSource(input);
  const prepared = await prepareCommit(tx, ctx, input, source);
  const occurrence: OccurrenceMap = new Map();
  const totals = new Map<string, bigint>();
  const counters = await commitRowsChunk(tx, ctx, input, prepared, 0, prepared.total, occurrence, totals);
  return finalizeCommit(tx, ctx, input, prepared, counters, totals);
}

type InsertArgs = {
  row: MappedRow;
  key: string;
  channelId: string | null;
  statementId: string | null;
  batchId: string;
  rowNo: number;
  /** Kunci alami baris ini sudah muncul di batch yang sama. */
  duplicateInBatch?: boolean;
};

type InsertOutcome =
  | { kind: "inserted"; id?: string; table: string; amount: bigint | null }
  | { kind: "duplicate"; table: string }
  | { kind: "invalid"; code?: string };

async function insertRow(
  tx: Tx, ctx: Ctx, report: ReportTypeDef, input: CommitInput, args: InsertArgs,
): Promise<InsertOutcome> {
  const { row, key } = args;
  if (report.key === "bank_lines") {
    const signed = bankSignedAmount(row, input.parsing.amountRule);
    const date = bankRowDate(row);
    if (signed.code || signed.minor === null) return { kind: "invalid", code: signed.code ?? "missing_amount" };
    if (!date) return { kind: "invalid", code: "missing_date" };
    const res = await tx.execute(sql`
      insert into bank_statement_lines
        (workspace_id, statement_id, posted_on, description, branch, amount, balance, direction, suggestion, source_row, seq, source_key,
         bank_alias_id, transaction_on, value_on, currency, external_transaction_ref)
      values (${ctx.workspaceId}, ${args.statementId}, ${date}, ${row.masked.description_raw ?? ""}, ${null},
        ${intOrNull(signed.minor)}, ${intOrNull(row.numbers.running_balance)}, ${signed.minor < 0n ? "debit" : "credit"}, ${null},
        ${args.rowNo}, ${null}, ${key},
        ${input.bankAliasId ?? null}, ${row.dates.transaction_date ?? null}, ${row.dates.value_date ?? null},
        ${row.values.currency_code || input.parsing.currencyCode || null}, ${row.values.external_transaction_reference || null})
      on conflict (workspace_id, source_key) where source_key is not null do nothing returning id`);
    const id = (res.rows[0] as { id: string } | undefined)?.id;
    return id ? { kind: "inserted", id, table: "bank_statement_lines", amount: signed.minor } : { kind: "duplicate", table: "bank_statement_lines" };
  }

  const date = marketplaceRowDate(report, row);
  // Hanya jenis laporan yang memang punya tanggal sendiri yang mewajibkannya.
  if (!date && report.requiresDate) return { kind: "invalid", code: "missing_date" };

  if (report.key === "orders_header") {
    const gross = row.numbers.order_gross_amount ?? null;
    const discount = row.numbers.order_discount_total ?? null;
    const shipping = row.numbers.shipping_amount ?? null;
    const net = gross === null ? null : gross - (discount ?? 0n);
    const res = await tx.execute(sql`
      insert into marketplace_orders
        (workspace_id, business_id, channel_id, order_no, occurred_on, gross_amount, discount, platform_fee, shipping_cost, net_amount,
         status, note, source_template, source_row, source_key, import_batch_id, external_order_ref,
         order_status_raw, purchase_channel, currency, buyer_reference_masked, order_updated_at)
      values (${ctx.workspaceId}, ${ctx.businessId}, ${args.channelId}, ${row.values.external_order_id || "TANPA-NOMOR"}, ${date},
        ${clampPos(gross)}, ${clampPos(discount)}, ${clampPos(null)}, ${clampPos(shipping)}, ${clampPos(net)},
        ${orderStatus(row.values.order_status_raw ?? "")},
        ${row.values.purchase_channel ? `Kanal pembelian: ${row.values.purchase_channel}` : null},
        ${report.key}, ${args.rowNo}, ${key}, ${args.batchId}, ${row.values.external_order_id || null},
        ${row.values.order_status_raw || null}, ${row.values.purchase_channel || null},
        ${row.values.currency_code || input.parsing.currencyCode || null}, ${row.masked.buyer_reference_masked || null},
        ${row.dates.order_updated_at ?? null})
      on conflict (workspace_id, source_key) where source_key is not null do nothing returning id`);
    const id = (res.rows[0] as { id: string } | undefined)?.id;
    return id ? { kind: "inserted", id, table: "marketplace_orders", amount: net } : { kind: "duplicate", table: "marketplace_orders" };
  }

  if (report.key === "orders_items") {
    // Tanggal pesanan opsional pada laporan item: tidak dikarang bila tidak ada.
    const quantity = row.numbers.quantity ?? null;
    const itemRef = row.values.external_item_id || null;
    if (!itemRef && args.duplicateInBatch) {
      // SKU/nilai sama dua kali di satu order itu SAH, tetapi tanpa ID item stabil
      // baris tidak boleh dianggap duplikat diam-diam.
      return { kind: "invalid", code: "potential_duplicate_item_identity" };
    }
    const res = await tx.execute(sql`
      insert into marketplace_order_items
        (workspace_id, business_id, channel_id, order_id, external_order_ref, external_item_ref, seller_sku, platform_sku,
         product_name_raw, variant_raw, quantity, unit_price, gross_line_amount, seller_discount_amount, platform_discount_amount,
         currency, order_on, identify_note, import_batch_id, source_row, source_key)
      values (${ctx.workspaceId}, ${ctx.businessId}, ${args.channelId},
        (select id from marketplace_orders o where o.workspace_id = ${ctx.workspaceId} and o.channel_id = ${args.channelId}
           and o.order_no = ${row.values.external_order_id || ""} limit 1),
        ${row.values.external_order_id || "TANPA-NOMOR"}, ${itemRef}, ${row.values.seller_sku || null}, ${row.values.platform_sku || null},
        ${row.values.product_name_raw || null}, ${row.values.variant_raw || null},
        ${intOrNull(quantity)}, ${intOrNull(row.numbers.unit_price)}, ${intOrNull(row.numbers.gross_line_amount)},
        ${intOrNull(row.numbers.seller_discount_amount)}, ${intOrNull(row.numbers.platform_discount_amount)},
        ${row.values.line_currency_code || input.parsing.currencyCode || null}, ${date},
        ${itemRef ? null : "Identitas baris dari SKU+jumlah (tanpa ID item stabil) — tinjau bila ada baris serupa."},
        ${args.batchId}, ${args.rowNo}, ${key})
      on conflict (workspace_id, source_key) where source_key is not null do nothing returning id`);
    const id = (res.rows[0] as { id: string } | undefined)?.id;
    const amount = row.numbers.gross_line_amount ?? null;
    return id ? { kind: "inserted", id, table: "marketplace_order_items", amount } : { kind: "duplicate", table: "marketplace_order_items" };
  }

  if (report.key === "settlement_summary") {
    const total = row.numbers.settlement_total ?? null;
    if (total === null) return { kind: "invalid", code: "missing_settlement_total" };
    const res = await tx.execute(sql`
      insert into marketplace_settlement_summaries
        (workspace_id, business_id, channel_id, statement_reference, statement_on, period_start, period_end, currency,
         gross_or_net_total, fee_total, adjustment_total, settlement_total, reserve_or_hold_amount, reconciliation_level,
         import_batch_id, source_row, source_key)
      values (${ctx.workspaceId}, ${ctx.businessId}, ${args.channelId},
        ${row.values.statement_reference || null}, ${row.dates.statement_date ?? date},
        ${row.dates.statement_period_start ?? null}, ${row.dates.statement_period_end ?? null},
        ${row.values.currency_code || input.parsing.currencyCode || null},
        ${intOrNull(row.numbers.gross_or_net_total)}, ${intOrNull(row.numbers.fee_total)}, ${intOrNull(row.numbers.adjustment_total)},
        ${intOrNull(total)}, ${intOrNull(row.numbers.reserve_or_hold_amount)}, 'summary_only',
        ${args.batchId}, ${args.rowNo}, ${key})
      on conflict (workspace_id, source_key) where source_key is not null do nothing returning id`);
    const id = (res.rows[0] as { id: string } | undefined)?.id;
    return id ? { kind: "inserted", id, table: "marketplace_settlement_summaries", amount: total } : { kind: "duplicate", table: "marketplace_settlement_summaries" };
  }

  // settlement_lines (BIGINT unit minor — tanpa pembulatan float)
  const net = row.numbers.net_sales_amount ?? null;
  const shipping = row.numbers.shipping_amount ?? null;
  const fees = row.numbers.fee_amount ?? null;
  const adjustment = row.numbers.adjustment_amount ?? null;
  const total = row.numbers.settlement_line_amount ?? null;
  const res = await tx.execute(sql`
    insert into marketplace_settlement_lines
      (workspace_id, business_id, channel_id, statement_id, external_payment_ref, entry_type, order_or_adjustment_id, related_order_ref,
       sku, currency, statement_on, net_sales, shipping, fees, adjustment, total_settlement, import_batch_id, source_row, source_key,
       line_type_raw, gross_sales_amount, seller_discount_amount, platform_discount_amount, refund_amount)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${args.channelId},
      ${row.values.statement_reference || null}, ${row.values.external_payment_reference || null},
      ${row.values.external_adjustment_id ? "adjustment" : "order"},
      ${row.values.external_adjustment_id || row.values.external_order_id || null}, ${row.values.external_order_id || null},
      ${null}, ${row.values.currency_code || input.parsing.currencyCode || null}, ${date},
      ${intOrNull(net)}, ${intOrNull(shipping)}, ${intOrNull(fees)}, ${intOrNull(adjustment)}, ${intOrNull(total)},
      ${args.batchId}, ${args.rowNo}, ${key},
      ${row.values.settlement_line_type_raw || null}, ${intOrNull(row.numbers.gross_sales_amount)},
      ${intOrNull(row.numbers.seller_discount_amount)}, ${intOrNull(row.numbers.platform_discount_amount)},
      ${intOrNull(row.numbers.refund_amount)})
    on conflict (workspace_id, source_key) where source_key is not null do nothing returning id`);
  const id = (res.rows[0] as { id: string } | undefined)?.id;
  if (id && row.values.external_payment_reference) {
    await tx.execute(sql`
      insert into marketplace_external_payment_references
        (workspace_id, business_id, channel_id, external_payment_ref, statement_reference, amount, currency, referenced_on,
         settlement_line_id, import_batch_id, source_row, source_key)
      values (${ctx.workspaceId}, ${ctx.businessId}, ${args.channelId}, ${row.values.external_payment_reference},
        ${row.values.statement_reference || null}, ${intOrNull(total)}, ${row.values.currency_code || input.parsing.currencyCode || null},
        ${date}, ${id}, ${args.batchId}, ${args.rowNo}, ${`${key}:ref`})
      on conflict (workspace_id, source_key) where source_key is not null do nothing`);
  }
  const amount = total ?? (net === null ? null : net + (shipping ?? 0n) + (fees ?? 0n) + (adjustment ?? 0n));
  return id ? { kind: "inserted", id, table: "marketplace_settlement_lines", amount } : { kind: "duplicate", table: "marketplace_settlement_lines" };
}

function maskLast4(label: string | null): string | null {
  if (!label) return null;
  const digits = label.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
