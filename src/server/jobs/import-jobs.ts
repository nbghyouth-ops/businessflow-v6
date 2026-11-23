/**
 * Pekerja job langkah-kecil impor (prompt R15 §2.1 / BF-088).
 *
 * Prinsip:
 *  - Tidak ada langkah yang menahan event loop lama: satu langkah = satu potongan
 *    baris (±500) di dalam SATU transaksi tenant, lalu kendali dilepas
 *    (`setImmediate`) sebelum potongan berikutnya.
 *  - Adil antar-tenant: job diambil menurut umur job tertua TIAP tenant, bukan
 *    hanya urutan global, sehingga satu tenant dengan banyak job tidak menguasai
 *    pekerja.
 *  - Aman banyak instans: pengambilan job memakai lease (`locked_until`) dan
 *    pembaruan bersyarat; job yang prosesnya mati dapat diambil lagi setelah lease
 *    habis dan dilanjutkan dari `cursor`.
 *  - Tanpa data setengah jadi: baris hasil commit baru terbit (`published_at`)
 *    pada langkah penutup; batal/gagal sebelum itu menghapus baris yang belum
 *    pernah terlihat oleh pembaca mana pun.
 */
import { randomUUID } from "node:crypto";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  addCounters,
  adaptChunkSize,
  ADVANCE_BUDGET_MS,
  chunkSizeFor,
  DEFAULT_CHUNK_SIZE,
  EMPTY_COUNTERS,
  LEASE_MS,
  MAX_CHUNK_SIZE,
  nextCursor,
  progressPercent,
  type JobInput,
  type JobKind,
  type JobState,
  type RowCounters,
} from "@/features/imports/jobs";
import { HttpError, audit, withTenant, type Ctx, type Tx } from "../core";
import {
  MAX_ROWS,
  bytesOf,
  parsePreviewSource,
  preparePreviewChunk,
  summarizePreview,
  type PreparedPreviewRow,
  type PreviewResult,
  type PreviewSource,
} from "../imports-record";
import {
  __commitProfile,
  cancelCommit,
  commitRowsChunk,
  finalizeCommit,
  loadCommitSource,
  prepareCommit,
  type CommitInput,
  type CommitResult,
  type CommitSource,
  type PreparedCommit,
} from "../imports-commit";
import { buildColumnPlan, normalizeMappedRow, type ColumnPlan, type ParsingOptions } from "@/features/imports/mapping-engine";

/** Baris job seperti dibaca pekerja (kolom eksplisit, bukan `select *`). */
export type JobRecord = {
  id: string;
  workspaceId: string;
  businessId: string;
  kind: JobKind;
  state: JobState;
  reportType: string;
  providerCode: string | null;
  providerLabel: string | null;
  sourceLabel: string | null;
  filename: string;
  sheetName: string;
  headerRow: number;
  mapping: Record<string, string>;
  parsing: Record<string, unknown>;
  channelId: string | null;
  cashAccountId: string | null;
  bankAliasId: string | null;
  profileId: string | null;
  profileVersion: number | null;
  total: number;
  cursor: number;
  processed: number;
  counters: RowCounters;
  /** Total unit minor per mata uang dari potongan yang sudah diproses. */
  totals: Record<string, string>;
  chunkSize: number;
  batchId: string | null;
  statementId: string | null;
  result: unknown;
  errorCode: string | null;
  errorParams: Record<string, unknown> | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  deviceId: string | null;
  operator: string | null;
  role: string | null;
  createdBy: string | null;
};

const JOB_COLUMNS = sql`
  id, workspace_id as "workspaceId", business_id as "businessId", kind, state,
  report_type as "reportType", provider_code as "providerCode", provider_label as "providerLabel",
  source_label as "sourceLabel", filename, sheet_name as "sheetName", header_row as "headerRow",
  mapping, parsing, channel_id as "channelId", cash_account_id as "cashAccountId", bank_alias_id as "bankAliasId",
  profile_id as "profileId", profile_version as "profileVersion", total, cursor, processed,
  valid, warning, needs_mapping as "needsMapping", invalid, duplicates, inserted, skipped, totals,
  chunk_size as "chunkSize", batch_id as "batchId", result, error_code as "errorCode",
  error_params as "errorParams", attempts, created_at as "createdAt", started_at as "startedAt",
  finished_at as "finishedAt", device_id as "deviceId", operator, role, created_by as "createdBy"
`;

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    ...(row as unknown as JobRecord),
    counters: {
      valid: Number(row.valid ?? 0),
      warning: Number(row.warning ?? 0),
      needsMapping: Number(row.needsMapping ?? 0),
      invalid: Number(row.invalid ?? 0),
      duplicates: Number(row.duplicates ?? 0),
      inserted: Number(row.inserted ?? 0),
      skipped: Number(row.skipped ?? 0),
    },
  };
}

/** Transaksi sistem pekerja: satu-satunya jalur yang boleh melihat job semua tenant. */
async function withJobRunner<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.job_runner', 'on', true)`);
    await tx.execute(sql`SET LOCAL ROLE bf_app`);
    return fn(tx);
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.());

/** Lepaskan kendali ke event loop tanpa menunggu timer (lebih murah dari setTimeout(0)). */
const yieldLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Ukur satu langkah kerja; langkah >150 ms dicatat supaya anggaran "tidak ada
 * langkah sinkron yang menahan event loop" dapat dibuktikan, bukan diklaim.
 */
async function timeStep<T>(jobId: string, label: string, fn: () => Promise<T> | T): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - t0);
    if (ms > 150) console.warn(`[import-job] ${jobId} langkah ${label} ${ms} ms`);
  }
}

function jobCtx(job: JobRecord): Ctx {
  return {
    deviceId: job.deviceId ?? job.id,
    deviceName: "import-job",
    operator: job.operator,
    workspaceId: job.workspaceId,
    businessId: job.businessId,
    branchId: null,
    role: job.role ?? "owner",
    ownerId: job.createdBy ?? undefined,
  };
}

function commitInputOf(job: JobRecord, bytes: Uint8Array): CommitInput {
  return {
    reportType: job.reportType,
    providerCode: job.providerCode ?? undefined,
    providerLabel: job.providerLabel ?? undefined,
    sourceLabel: job.sourceLabel ?? undefined,
    filename: job.filename,
    sheetName: job.sheetName,
    headerRow: job.headerRow,
    mapping: job.mapping ?? {},
    parsing: job.parsing as CommitInput["parsing"],
    channelId: job.channelId ?? undefined,
    cashAccountId: job.cashAccountId ?? undefined,
    bankAliasId: job.bankAliasId ?? undefined,
    profileId: job.profileId ?? undefined,
    profileVersion: job.profileVersion ?? undefined,
    bytes,
  };
}

/* ───────────────────────── antrean ───────────────────────── */

/** Baris lama tertua per tenant menang; job satu tenant tidak menguasai pekerja. */
export async function claimNextJob(workerId: string): Promise<JobRecord | null> {
  return withJobRunner(async (tx) => {
    const pick = await tx.execute(sql`
      select j.id from import_jobs j
      where j.state = 'QUEUED'
         or (j.state = 'RUNNING' and (j.locked_until is null or j.locked_until < now()))
      order by (
        select min(k.created_at) from import_jobs k
        where k.workspace_id = j.workspace_id
          and (k.state = 'QUEUED' or (k.state = 'RUNNING' and (k.locked_until is null or k.locked_until < now())))
      ) asc, j.created_at asc
      limit 1`);
    const id = (pick.rows[0] as { id: string } | undefined)?.id;
    if (!id) return null;
    const claimed = await tx.execute(sql`
      update import_jobs set state = 'RUNNING', locked_by = ${workerId},
        locked_until = now() + (${LEASE_MS} || ' milliseconds')::interval,
        attempts = attempts + 1, started_at = coalesce(started_at, now()), heartbeat_at = now()
      where id = ${id}
        and (state = 'QUEUED' or (state = 'RUNNING' and (locked_until is null or locked_until < now())))
      returning ${JOB_COLUMNS}`);
    const row = claimed.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  });
}

export async function loadJob(workspaceId: string, id: string): Promise<JobRecord | null> {
  return withTenant({ workspaceId } as Ctx, async (tx) => {
    const res = await tx.execute(sql`select ${JOB_COLUMNS} from import_jobs where workspace_id = ${workspaceId} and id = ${id} limit 1`);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  });
}

/** Progres publik (tanpa isi berkas). */
export type JobProgress = {
  id: string;
  kind: JobKind;
  state: JobState;
  reportType: string;
  provider: string | null;
  filename: string;
  total: number;
  processed: number;
  percent: number;
  counters: RowCounters;
  attempts: number;
  error: { code: string; params: Record<string, unknown> } | null;
  result: unknown;
  createdAt: string;
  finishedAt: string | null;
};

export function toProgress(job: JobRecord): JobProgress {
  return {
    id: job.id,
    kind: job.kind,
    state: job.state,
    reportType: job.reportType,
    provider: job.providerCode,
    filename: job.filename,
    total: job.total,
    processed: job.processed,
    percent: progressPercent(job.processed, job.total),
    counters: job.counters,
    attempts: job.attempts,
    error: job.errorCode ? { code: job.errorCode, params: job.errorParams ?? {} } : null,
    result: job.result,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  };
}

export async function enqueueImportJob(ctx: Ctx, input: JobInput): Promise<JobProgress> {
  let t = performance.now();
  const bytes = bytesOf(input);
  const decodeMs = Math.round(performance.now() - t);
  if (decodeMs > 100) console.warn(`[import-job-enqueue] decode ${decodeMs} ms`);
  if (bytes.length === 0) throw new HttpError(422, "Berkas kosong (0 byte).", "FILE_VALIDATION_FAILED");
  const job = await withTenant(ctx, async (tx) => {
    t = performance.now();
    const [row] = (
      await tx.execute(sql`
        insert into import_jobs
          (workspace_id, business_id, kind, state, report_type, provider_code, provider_label, source_label,
           filename, sheet_name, header_row, mapping, parsing, channel_id, cash_account_id, bank_alias_id,
           profile_id, profile_version, chunk_size, created_by, device_id, operator, role)
        values (${ctx.workspaceId}, ${ctx.businessId}, ${input.kind}, 'QUEUED', ${input.reportType},
          ${input.providerCode ?? null}, ${input.providerLabel ?? null}, ${input.sourceLabel ?? null},
          ${input.filename}, ${input.sheetName}, ${input.headerRow},
          ${JSON.stringify(input.mapping ?? {})}::jsonb, ${JSON.stringify(input.parsing ?? {})}::jsonb,
          ${input.channelId ?? null}, ${input.cashAccountId ?? null}, ${input.bankAliasId ?? null},
          ${input.profileId ?? null}, ${input.profileVersion ?? null}, ${chunkSizeFor(MAX_ROWS)},
          ${ctx.ownerId ?? null}, ${ctx.deviceId}, ${ctx.operator}, ${ctx.role})
        returning id`)
    ).rows as Array<{ id: string }>;
    const packed = await gzipAsync(Buffer.from(bytes));
    const gzipMs = Math.round(performance.now() - t);
    if (gzipMs > 100) console.warn(`[import-job-enqueue] gzip ${gzipMs} ms`);
    t = performance.now();
    await tx.execute(sql`
      insert into import_job_files (job_id, workspace_id, content, size_bytes, encoding)
      values (${row.id}, ${ctx.workspaceId}, ${packed}, ${bytes.length}, 'gzip')`);
    const writeMs = Math.round(performance.now() - t);
    if (writeMs > 100) console.warn(`[import-job-enqueue] write-file ${writeMs} ms`);
    await audit(tx, ctx, "import.job.enqueue", "import_job", row.id, { kind: input.kind, reportType: input.reportType });
    return { id: row.id };
  });
  ensureJobRunner();
  t = performance.now();
  const loaded = await loadJob(ctx.workspaceId, job.id);
  const loadMs = Math.round(performance.now() - t);
  if (loadMs > 100) console.warn(`[import-job-enqueue] load-progress ${loadMs} ms`);
  return loaded ? toProgress(loaded) : {
    id: job.id, kind: input.kind, state: "QUEUED", reportType: input.reportType, provider: input.providerCode ?? null,
    filename: input.filename, total: 0, processed: 0, percent: 0, counters: { ...EMPTY_COUNTERS }, attempts: 0,
    error: null, result: null, createdAt: new Date().toISOString(), finishedAt: null,
  };
}

/** Minta batal. Pekerja yang sedang berjalan melihatnya sebelum potongan berikutnya. */
export async function cancelJob(ctx: Ctx, id: string): Promise<JobProgress> {
  const job = await withTenant(ctx, async (tx) => {
    const res = await tx.execute(sql`
      update import_jobs set state = 'CANCELED'
      where workspace_id = ${ctx.workspaceId} and id = ${id} and state in ('QUEUED', 'RUNNING', 'PAUSED')
      returning ${JOB_COLUMNS}`);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      const exists = await tx.execute(sql`select state from import_jobs where workspace_id = ${ctx.workspaceId} and id = ${id}`);
      const s = (exists.rows[0] as { state?: string } | undefined)?.state;
      if (!s) throw new HttpError(404, "Job impor tidak ditemukan.", "not_found");
      throw new HttpError(409, `Job tidak dapat dibatalkan (status ${s}).`, "job_not_cancelable");
    }
    await audit(tx, ctx, "import.job.cancel", "import_job", id, {});
    return rowToJob(row);
  });
  // Job yang dibatalkan TIDAK boleh meninggalkan baris setengah jadi: baris yang belum
  // pernah terbit dihapus di sini, bukan menunggu pekerja kebetulan memeriksa status lagi
  // (mode serverless tidak punya pekerja tetap).
  const swept = await sweepCanceledJob(job);
  return toProgress(swept);
}

/**
 * Bersihkan baris yang belum pernah terbit milik job berstatus CANCELED. Idempoten dan
 * aman dipanggil berkali-kali; hanya menyentuh baris `published_at is null` sehingga hasil
 * yang sudah pernah dilihat pembaca tidak pernah hilang.
 */
async function sweepCanceledJob(job: JobRecord): Promise<JobRecord> {
  if (job.state !== "CANCELED" || !job.batchId) {
    if (job.state === "CANCELED") await dropFile(job.workspaceId, job.id);
    return job;
  }
  const ctx = jobCtx(job);
  await withTenant({ workspaceId: job.workspaceId } as Ctx, (tx) =>
    cancelCommit(tx, ctx, { batchId: job.batchId as string, statementId: job.statementId }, "cancelled_by_user"));
  await dropFile(job.workspaceId, job.id);
  runtimes.delete(job.id);
  return (await loadJob(job.workspaceId, job.id)) ?? job;
}

/** Lanjutkan job yang PAUSED/FAILED pada cursor terakhir (idempoten per potongan). */
export async function resumeJob(ctx: Ctx, id: string): Promise<JobProgress> {
  const job = await withTenant(ctx, async (tx) => {
    const res = await tx.execute(sql`
      update import_jobs set state = 'QUEUED', error_code = null, error_params = null, locked_by = null, locked_until = null
      where workspace_id = ${ctx.workspaceId} and id = ${id} and state in ('PAUSED', 'FAILED')
      returning ${JOB_COLUMNS}`);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      const exists = await tx.execute(sql`select state from import_jobs where workspace_id = ${ctx.workspaceId} and id = ${id}`);
      const s = (exists.rows[0] as { state?: string } | undefined)?.state;
      if (!s) throw new HttpError(404, "Job impor tidak ditemukan.", "not_found");
      throw new HttpError(409, `Job tidak dapat dilanjutkan (status ${s}).`, "job_not_resumable");
    }
    await audit(tx, ctx, "import.job.resume", "import_job", id, {});
    return rowToJob(row);
  });
  ensureJobRunner();
  return toProgress(job);
}

/**
 * Mode serverless-aman (prompt R16 §2.1): satu permintaan HTTP memproses potongan
 * berikutnya sampai anggaran waktu habis, lalu menandai job `PAUSED` supaya UI dapat
 * memanggil `advance` lagi. TIDAK memerlukan loop latar, cron, atau ENV baru.
 *
 * Keamanan banyak pemanggil: lease `locked_until` dipegang selama satu panggilan
 * berjalan, dan pengambilan bersifat kondisional, sehingga dua panggilan paralel
 * (atau dua instans) tidak pernah memproses potongan yang sama. Pemanggil kedua
 * menerima `busy: true` beserta progres terbaru, bukan galat.
 */
export type JobAdvance = JobProgress & { busy: boolean; budgetMs: number };

export async function advanceJob(
  ctx: Ctx,
  id: string,
  opts: { budgetMs?: number; workerId?: string } = {},
): Promise<JobAdvance> {
  const budgetMs = Math.max(250, Math.min(opts.budgetMs ?? ADVANCE_BUDGET_MS, ADVANCE_BUDGET_MS));
  const workerId = opts.workerId ?? `advance-${randomUUID().slice(0, 8)}`;
  const claimed = await withJobRunner(async (tx) => {
    const res = await tx.execute(sql`
      update import_jobs set state = 'RUNNING', locked_by = ${workerId},
        locked_until = now() + (${LEASE_MS} || ' milliseconds')::interval,
        attempts = attempts + 1, started_at = coalesce(started_at, now()), heartbeat_at = now()
      where workspace_id = ${ctx.workspaceId} and id = ${id}
        and state in ('QUEUED', 'PAUSED', 'RUNNING')
        and (state in ('QUEUED', 'PAUSED') or locked_until is null or locked_until < now())
      returning ${JOB_COLUMNS}`);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  });

  if (!claimed) {
    let current = await loadJob(ctx.workspaceId, id);
    if (!current) throw new HttpError(404, "Job impor tidak ditemukan.", "not_found");
    // Job yang sudah dibatalkan dibersihkan di sini juga, supaya pemanggil advance
    // berikutnya (UI) tidak perlu tahu urutan pembatalan.
    if (current.state === "CANCELED") current = await sweepCanceledJob(current);
    // Sedang dipegang pemanggil/potongan lain: bukan galat, cukup laporkan progres.
    return { ...toProgress(current), busy: current.state === "RUNNING", budgetMs };
  }

  const deadline = performance.now() + budgetMs;
  try {
    await runJob(claimed, { deadline });
  } catch (err) {
    await failJob(claimed, err);
    runtimes.delete(id);
    const failed = await loadJob(ctx.workspaceId, id);
    return { ...toProgress(failed ?? claimed), busy: false, budgetMs };
  }

  const after = (await loadJob(ctx.workspaceId, id)) ?? claimed;
  if (after.state !== "RUNNING") return { ...toProgress(after), busy: false, budgetMs };

  // Anggaran habis (atau pekerja lokal masih memegangnya): lepaskan lease dan tandai
  // PAUSED — berarti "menunggu panggilan advance berikutnya", bukan gagal.
  const paused = await withTenant(ctx, async (tx) => {
    await tx.execute(sql`
      update import_jobs set state = 'PAUSED', locked_by = null, locked_until = null, heartbeat_at = now()
      where workspace_id = ${ctx.workspaceId} and id = ${id} and state = 'RUNNING'`);
    const res = await tx.execute(sql`
      select ${JOB_COLUMNS} from import_jobs where workspace_id = ${ctx.workspaceId} and id = ${id} limit 1`);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  });
  return { ...toProgress(paused ?? after), busy: false, budgetMs };
}

/* ───────────────────────── pekerja ───────────────────────── */

type Runtime = {
  bytes?: Uint8Array;
  previewSource?: PreviewSource;
  previewRows?: PreparedPreviewRow[];
  commitSource?: CommitSource;
  prepared?: PreparedCommit;
  occurrence: Map<string, number>;
  totals: Map<string, bigint>;
  counters: RowCounters;
  replayDone?: boolean;
};

const runtimes = new Map<string, Runtime>();

/** Hanya untuk tes: buang keadaan memori sehingga jalur "proses mati" benar-benar diuji. */
export function __resetJobRuntimeForTests(): void {
  runtimes.clear();
}

async function readFileBytes(workspaceId: string, jobId: string): Promise<Uint8Array> {
  const { content, encoding } = await withTenant({ workspaceId } as Ctx, async (tx) => {
    const res = await tx.execute(sql`
      select content, encoding from import_job_files where workspace_id = ${workspaceId} and job_id = ${jobId} limit 1`);
    const row = res.rows[0] as { content?: Buffer; encoding?: string } | undefined;
    if (!row?.content) throw new HttpError(409, "Isi berkas job tidak ditemukan (job tidak dapat dilanjutkan).", "job_file_missing");
    return { content: row.content, encoding: row.encoding ?? "raw" };
  });
  // Dekompresi di threadpool (bukan event loop).
  const raw = encoding === "gzip" ? await gunzipAsync(content) : content;
  return new Uint8Array(raw);
}

async function dropFile(workspaceId: string, jobId: string): Promise<void> {
  await withTenant({ workspaceId } as Ctx, async (tx) => {
    await tx.execute(sql`delete from import_job_files where workspace_id = ${workspaceId} and job_id = ${jobId}`);
  });
}

async function saveProgress(
  job: JobRecord,
  state: JobState,
  patch: {
    total?: number;
    cursor?: number;
    processed?: number;
    counters?: RowCounters;
    totals?: Record<string, string>;
    /** Kanal yang benar-benar dipakai (hasil resolusi), bukan hanya pilihan pengguna. */
    channelId?: string | null;
    batchId?: string | null;
    statementId?: string | null;
    result?: unknown;
    errorCode?: string | null;
    errorParams?: Record<string, unknown> | null;
    finished?: boolean;
    chunkSize?: number;
  },
  existingTx?: Tx,
): Promise<void> {
  const c = patch.counters ?? job.counters;
  const write = async (tx: Tx) => {
    await tx.execute(sql`
      update import_jobs set
        state = ${state},
        total = coalesce(${patch.total ?? null}::int, total),
        cursor = coalesce(${patch.cursor ?? null}::int, cursor),
        processed = coalesce(${patch.processed ?? null}::int, processed),
        valid = ${c.valid}, warning = ${c.warning}, needs_mapping = ${c.needsMapping},
        invalid = ${c.invalid}, duplicates = ${c.duplicates}, inserted = ${c.inserted}, skipped = ${c.skipped},
        totals = coalesce(${patch.totals === undefined ? null : JSON.stringify(patch.totals)}::jsonb, totals),
        chunk_size = coalesce(${patch.chunkSize ?? null}::int, chunk_size),
        channel_id = coalesce(${patch.channelId ?? null}::uuid, channel_id),
        batch_id = coalesce(${patch.batchId ?? null}::uuid, batch_id),
        result = coalesce(${patch.result === undefined ? null : JSON.stringify(patch.result)}::jsonb, result),
        error_code = ${patch.errorCode === undefined ? null : patch.errorCode},
        error_params = ${patch.errorParams === undefined ? null : JSON.stringify(patch.errorParams)}::jsonb,
        locked_until = now() + (${LEASE_MS} || ' milliseconds')::interval,
        heartbeat_at = now(),
        finished_at = ${patch.finished ? sql`now()` : sql`finished_at`}
      where workspace_id = ${job.workspaceId} and id = ${job.id}`);
  };
  if (existingTx) await write(existingTx);
  else await withTenant({ workspaceId: job.workspaceId } as Ctx, write);
  void patch.statementId;
}

async function currentState(job: JobRecord): Promise<{ state: JobState; cursor: number }> {
  return withTenant({ workspaceId: job.workspaceId } as Ctx, async (tx) => {
    const res = await tx.execute(sql`select state, cursor from import_jobs where workspace_id = ${job.workspaceId} and id = ${job.id}`);
    const row = res.rows[0] as { state: JobState; cursor: number } | undefined;
    return row ?? { state: job.state, cursor: job.cursor };
  });
}

async function runtimeFor(job: JobRecord): Promise<Runtime> {
  const existing = runtimes.get(job.id);
  if (existing) return existing;
  const rt: Runtime = { occurrence: new Map(), totals: new Map(), counters: { ...EMPTY_COUNTERS } };
  rt.bytes = await readFileBytes(job.workspaceId, job.id);
  runtimes.set(job.id, rt);
  return rt;
}

async function failJob(job: JobRecord, err: unknown): Promise<void> {
  const code = (err as { code?: string }).code ?? "job_failed";
  const message = err instanceof Error ? err.message : "Job gagal.";
  const retryable = /ECONNRESET|ETIMEDOUT|57P01|08006|53300/.test(String((err as { code?: string }).code ?? "")) || /connection|timeout/i.test(message);
  await saveProgress(job, retryable ? "PAUSED" : "FAILED", {
    errorCode: retryable ? "job_paused_db" : code,
    errorParams: { message: message.slice(0, 300) },
    finished: !retryable,
  });
}

/** Satu potongan kerja; melepas kendali setelahnya. */
async function runPreviewJob(job: JobRecord, rt: Runtime, deadline?: number): Promise<void> {
  const ctx = jobCtx(job);
  const input = {
    reportType: job.reportType,
    providerCode: job.providerCode ?? undefined,
    providerLabel: job.providerLabel ?? undefined,
    sourceLabel: job.sourceLabel ?? undefined,
    bankAliasId: job.bankAliasId ?? undefined,
    filename: job.filename,
    sheetName: job.sheetName,
    headerRow: job.headerRow,
    mapping: job.mapping ?? {},
    parsing: job.parsing as never,
    profileId: job.profileId ?? undefined,
    profileVersion: job.profileVersion ?? undefined,
  };

  if (!rt.previewSource) {
    const bytes = rt.bytes ?? (await readFileBytes(job.workspaceId, job.id));
    rt.bytes = bytes;
    // Profil pemetaan dibaca di dalam transaksi tenant (RLS), bukan sebagai owner.
    rt.previewSource = await timeStep(job.id, "parse", () =>
      withTenant({ workspaceId: job.workspaceId } as Ctx, (tx) =>
        parsePreviewSource(tx, job.workspaceId, { ...input, bytes })));
    rt.previewRows = [];
    rt.occurrence = new Map();
    if (!job.total) {
      await saveProgress(job, "RUNNING", { total: rt.previewSource.dataRows.length, processed: 0, counters: EMPTY_COUNTERS });
      job.total = rt.previewSource.dataRows.length;
      job.processed = 0;
      job.cursor = 0;
    }
  }

  const source = rt.previewSource;
  const prepared = rt.previewRows ?? (rt.previewRows = []);

  // Lanjutkan dari cursor: bila proses mati, baris [0, cursor) diputar ulang
  // (normalisasi murah per potongan) supaya kemunculan kunci alami tetap sama.
  if (prepared.length < job.cursor) {
    let replayFrom = prepared.length;
    while (replayFrom < job.cursor) {
      const to = nextCursor(replayFrom, Math.min(job.chunkSize, 1_000), job.cursor);
      preparePreviewChunk(source, input, replayFrom, to, rt.occurrence, prepared);
      replayFrom = to;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  let cursor = job.cursor;
  let chunk = Math.max(1, Math.min(job.chunkSize || DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE));
  let step = 0;
  let lastCancelCheck = 0;
  while (cursor < source.dataRows.length) {
    // Anggaran waktu (mode serverless "advance"): kembalikan kendali TANPA menutup job.
    // Progres sudah tersimpan di transaksi potongan terakhir, jadi pemanggilan
    // berikutnya melanjutkan dari cursor yang sama.
    if (deadline !== undefined && performance.now() >= deadline) {
      job.cursor = cursor;
      job.processed = cursor;
      return;
    }
    // Pembatalan diperiksa paling sering tiap 400 ms — bukan tiap potongan. Satu
    // round-trip DB per potongan terbukti memperlambat tanpa menambah keamanan.
    const tick = performance.now();
    if (tick - lastCancelCheck > 400) {
      lastCancelCheck = tick;
      const state = (await currentState(job)).state;
      if (state === "CANCELED") {
        await saveProgress(job, "CANCELED", { finished: true });
        await dropFile(job.workspaceId, job.id);
        runtimes.delete(job.id);
        return;
      }
    }
    const to = nextCursor(cursor, chunk, source.dataRows.length);
    const t0 = performance.now();
    preparePreviewChunk(source, input, cursor, to, rt.occurrence, prepared);
    cursor = to;
    // Ukuran potongan berikutnya mengikuti durasi potongan ini (R17 §2.2a).
    const nextChunk = adaptChunkSize(chunk, performance.now() - t0);
    await saveProgress(job, "RUNNING", { cursor, processed: cursor, counters: job.counters, chunkSize: nextChunk });
    chunk = nextChunk;
    job.chunkSize = nextChunk;
    step += 1;
    // Setiap 20 potongan beri jeda nyata: tenant lain mendapat giliran CPU/DB walau
    // satu tenant sedang mengimpor puluhan ribu baris.
    if (step % 20 === 0) await sleep(5);
    else await yieldLoop();
  }
  job.cursor = cursor;
  job.processed = cursor;

  if (cursor >= source.dataRows.length) {
    const result = await timeStep(job.id, "summarize", () =>
      withTenant(ctx, (tx) => summarizePreview(tx, job.workspaceId, source, { ...input }, prepared)));
    const counters = {
      valid: result.summary.valid,
      warning: result.summary.warning,
      needsMapping: result.summary.needsMapping,
      invalid: result.summary.invalid,
      duplicates: result.summary.duplicates,
      inserted: 0,
      skipped: 0,
    };
    await saveProgress(job, "DONE", { cursor, processed: cursor, counters, result, finished: true });
    await dropFile(job.workspaceId, job.id);
    runtimes.delete(job.id);
  }
}

async function runCommitJob(job: JobRecord, rt: Runtime, deadline?: number): Promise<void> {
  const ctx = jobCtx(job);
  const bytes = rt.bytes ?? (await readFileBytes(job.workspaceId, job.id));
  rt.bytes = bytes;
  const input = commitInputOf(job, bytes);

  if (!rt.commitSource) {
    rt.commitSource = await timeStep(job.id, "parse-commit", () => loadCommitSource(input));
    rt.occurrence = new Map();
    rt.totals = new Map();
    rt.counters = { ...EMPTY_COUNTERS };
  }
  const source = rt.commitSource;

  // Job yang dilanjutkan: hitungan & total per mata uang dari potongan sebelumnya
  // dibaca dari baris job (bukan dimulai dari nol, yang akan melaporkan angka kurang).
  if (job.cursor > 0) {
    rt.counters = { ...job.counters };
    if (Object.keys(job.totals ?? {}).length > 0) {
      rt.totals = new Map(Object.entries(job.totals).map(([currency, value]) => [currency, BigInt(value)]));
    }
  }

  if (!rt.prepared) {
    if (job.batchId) {
      // Proses mati setelah batch dibuat: pakai batch yang sama (tanpa batch kedua).
      rt.prepared = {
        batchId: job.batchId,
        channelId: job.channelId,
        statementId: job.statementId,
        headers: source.headers,
        dataRows: source.dataRows,
        total: source.dataRows.length,
        report: source.report,
        domain: source.report.domain,
        plan: buildColumnPlan(source.report, source.headers, input.mapping),
      };
    } else {
      rt.prepared = await withTenant(ctx, (tx) => prepareCommit(tx, ctx, input, source));
      job.batchId = rt.prepared.batchId;
      job.statementId = rt.prepared.statementId;
      await saveProgress(job, "RUNNING", {
        total: rt.prepared.total,
        channelId: rt.prepared.channelId,
        batchId: rt.prepared.batchId,
        statementId: rt.prepared.statementId,
        processed: 0,
      });
      job.channelId = rt.prepared.channelId ?? job.channelId;
      job.total = rt.prepared.total;
      job.processed = 0;
      job.cursor = 0;
    }
  }
  const prepared = rt.prepared;

  // Putar ulang kemunculan kunci untuk baris yang sudah diproses (resume aman).
  if (job.cursor > 0 && job.cursor > jobProcessedCount(rt)) {
    let from = jobProcessedCount(rt);
    const replayPlan = buildColumnPlan(source.report, source.headers, input.mapping);
    while (from < job.cursor) {
      const to = nextCursor(from, Math.min(job.chunkSize, 1_000), job.cursor);
      for (let i = from; i < to; i++) {
        const row = normalizeForReplay(source, i, input, replayPlan);
        const n = rt.occurrence.get(row) ?? 0;
        rt.occurrence.set(row, n + 1);
      }
      from = to;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  let cursor = job.cursor;
  let chunk = Math.max(1, Math.min(job.chunkSize || DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE));
  let step = 0;
  let lastCancelCheck = 0;
  while (cursor < prepared.total) {
    if (deadline !== undefined && performance.now() >= deadline) {
      job.cursor = cursor;
      job.processed = cursor;
      return;
    }
    // Pembatalan diperiksa paling sering tiap 400 ms (bukan tiap potongan).
    const tick = performance.now();
    if (tick - lastCancelCheck > 400) {
      lastCancelCheck = tick;
      const state = (await currentState(job)).state;
      if (state === "CANCELED") {
        await withTenant(ctx, (tx) => cancelCommit(tx, ctx, prepared, "cancelled_by_user"));
        await saveProgress(job, "CANCELED", { finished: true });
        await dropFile(job.workspaceId, job.id);
        runtimes.delete(job.id);
        return;
      }
    }
    const to = nextCursor(cursor, chunk, prepared.total);
    const chunkStart = performance.now();
    let chunkForNext = chunk;
    const counters = await withTenant(ctx, async (tx) => {
      const delta = await commitRowsChunk(tx, ctx, input, prepared, cursor, to, rt.occurrence, rt.totals);
      // Progres disimpan dalam transaksi yang sama dengan barisnya: tidak ada
      // laporan progres yang "mendahului" data. Ukuran potongan berikutnya ikut
      // disimpan supaya job yang dilanjutkan instans lain tetap adaptif.
      const merged = addCounters(job.counters, delta);
      chunkForNext = adaptChunkSize(chunk, performance.now() - chunkStart);
      await saveProgress({ ...job, workspaceId: ctx.workspaceId }, "RUNNING", {
        cursor: to, processed: to, counters: merged,
        totals: Object.fromEntries([...rt.totals].map(([currency, value]) => [currency, value.toString()])),
        chunkSize: chunkForNext,
      }, tx);
      return merged;
    });
    rt.counters = counters;
    job.counters = counters;
    cursor = to;
    job.cursor = cursor;
    job.processed = cursor;
    chunk = chunkForNext;
    job.chunkSize = chunk;
    step += 1;
    if (step % 20 === 0) await sleep(5);
    else await yieldLoop();
  }

  if (cursor >= prepared.total) {
    const result: CommitResult = await withTenant(ctx, (tx) =>
      finalizeCommit(tx, ctx, input, prepared, rt.counters, rt.totals));
    if (process.env.BF_PROFILE_STEPS === "1") {
      const p = __commitProfile();
      console.info(`[commit-profile] rows=${p.rows} normalize=${Math.round(p.normalizeMs)} insert=${Math.round(p.insertMs)} journal=${Math.round(p.journalMs)}`);
    }
    await saveProgress(job, "DONE", {
      cursor, processed: cursor, counters: rt.counters, result, finished: true,
    });
    await dropFile(job.workspaceId, job.id);
    runtimes.delete(job.id);
  }
}

function jobProcessedCount(rt: Runtime): number {
  return rt.counters.inserted + rt.counters.duplicates + rt.counters.invalid + rt.counters.skipped;
}

/** Basis kunci untuk pemutaran ulang saat resume (sama dengan commitRowsChunk). */
function normalizeForReplay(source: CommitSource, i: number, input: CommitInput, plan: ColumnPlan): string {
  return normalizeMappedRow(
    source.report, source.headers, source.dataRows[i], i + input.headerRow + 2, input.mapping, input.parsing, plan,
  ).keyBase;
}

async function runJob(job: JobRecord, opts: { deadline?: number } = {}): Promise<void> {
  const rt = await runtimeFor(job);
  if (job.kind === "PREVIEW") await runPreviewJob(job, rt, opts.deadline);
  else await runCommitJob(job, rt, opts.deadline);
}

let workerRunning = false;
const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;

async function workerLoop(): Promise<void> {
  let idle = 0;
  for (;;) {
    let job: JobRecord | null = null;
    try {
      job = await claimNextJob(WORKER_ID);
    } catch (err) {
      console.error("[import-job] klaim job gagal", (err as Error).message);
      await sleep(1_000);
      continue;
    }
    if (!job) {
      idle += 1;
      // Setelah lama menganggur, loop berhenti; permintaan berikutnya menyalakannya lagi.
      if (idle > 120) { workerRunning = false; return; }
      await sleep(250);
      continue;
    }
    idle = 0;
    try {
      await runJob(job);
    } catch (err) {
      await failJob(job, err);
      runtimes.delete(job.id);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** Nyalakan pekerja bila belum berjalan (idempoten, aman banyak instans lewat lease). */
export function ensureJobRunner(): void {
  // Tes menjalankan pekerja secara eksplisit (drainJobsOnce) agar dapat menguji juga
  // jalur "proses mati": tidak ada loop latar yang berlomba dengan asersi.
  if (process.env.BF_JOB_RUNNER === "off") return;
  if (workerRunning) return;
  workerRunning = true;
  void workerLoop().catch((err) => {
    workerRunning = false;
    console.error("[import-job] pekerja berhenti", (err as Error).message);
  });
}

/** Dipakai tes: jalankan pekerja sampai antrean kosong (bounded). */
export async function drainJobsOnce(workerId = WORKER_ID): Promise<number> {
  let processed = 0;
  for (let i = 0; i < 10_000; i++) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    try {
      await runJob(job);
    } catch (err) {
      await failJob(job, err);
      runtimes.delete(job.id);
    }
    processed += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return processed;
}

export type { ParsingOptions };
