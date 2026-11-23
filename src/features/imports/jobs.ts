/**
 * Perencana job langkah-kecil (prompt R15 §2.1 / BF-088) — bagian MURNI.
 *
 * Tidak ada DB, tidak ada timer, tidak ada I/O. Semua keputusan yang bisa diuji
 * (ukuran potongan, batas cursor, progres, perkiraan sisa, penjumlahan status)
 * ada di sini supaya perilaku runner dapat diuji tanpa PostgreSQL.
 */
import type { ColumnMap, ParsingOptions } from "./mapping-engine";

export const JOB_KINDS = ["PREVIEW", "COMMIT"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATES = ["QUEUED", "RUNNING", "PAUSED", "DONE", "FAILED", "CANCELED"] as const;
export type JobState = (typeof JOB_STATES)[number];

/**
 * Potongan baris per langkah.
 *
 * Setiap potongan = SATU transaksi (fsync). Potongan terlalu kecil membuat biaya commit
 * per baris membengkak — terukur: potongan 100 baris turun ke 539 baris/dtk, sedangkan
 * 500 baris 814 baris/dtk. Setelah kerja CPU per baris ditekan (rencana kolom
 * sekali-per-berkas + jalur cepat PII), 1.000 baris tetap di bawah anggaran blokir,
 * jadi potongan dasar dinaikkan agar jumlah fsync separuh.
 */
export const DEFAULT_CHUNK_SIZE = 1_000;
export const MIN_CHUNK_SIZE = 250;
export const MAX_CHUNK_SIZE = 2_000;

/** Lease job: bila proses mati, job boleh diambil lagi setelah lease habis. */
export const LEASE_MS = 60_000;

/**
 * Anggaran satu panggilan `advance` (prompt R16 §2.1). Job harus dapat selesai hanya
 * dengan permintaan HTTP biasa di lingkungan serverless (Vercel: TIDAK ada loop latar
 * yang dijamin hidup, dan ENV terkunci pada 5 variabel wajib). 6 dtk berada di bawah
 * `maxDuration` bawaan fungsi serverless yang dipakai proyek ini.
 */
export const ADVANCE_BUDGET_MS = 6_000;

/** Berapa lama UI boleh menunggu progres sebelum dianggap macet. */
export const ADVANCE_MAX_STEPS = 900;

export type JobInput = {
  kind: JobKind;
  reportType: string;
  providerCode?: string;
  providerLabel?: string;
  sourceLabel?: string;
  filename: string;
  sheetName: string;
  headerRow: number;
  mapping: ColumnMap;
  parsing: ParsingOptions;
  channelId?: string;
  cashAccountId?: string;
  bankAliasId?: string;
  profileId?: string;
  profileVersion?: number;
  text?: string;
  base64?: string;
};

/** Ukuran potongan adaptif: dibatasi agar satu langkah tetap di bawah anggaran. */
export function chunkSizeFor(totalRows: number): number {
  if (!Number.isFinite(totalRows) || totalRows <= 0) return DEFAULT_CHUNK_SIZE;
  if (totalRows <= 1_000) return MIN_CHUNK_SIZE + 100; // 350
  if (totalRows >= 20_000) return DEFAULT_CHUNK_SIZE;
  return Math.min(MAX_CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, Math.round(totalRows / 40)));
}

/**
 * Ukuran potongan ADAPTIF berbasis waktu (R17 §2.2a).
 *
 * `elapsedMs` adalah DURASI DINDING satu potongan, dan sebagian besarnya adalah
 * tunggu DB (insert + commit), bukan kerja CPU. Karena itu ambangnya sengaja longgar:
 * potongan hanya dikecilkan bila benar-benar lambat, supaya throughput tidak jatuh
 * karena potongan kecil (makin kecil potongan, makin banyak round-trip).
 *
 * Angka ambang berasal dari pengukuran pada mesin ini:
 *  - potongan 500 baris ≈ 300–600 ms dinding (insert + fsync mendominasi)
 *  - kerja CPU per baris turun drastis setelah rencana kolom sekali-per-berkas
 * Batas keras event loop (p99 < 200 ms, maks < 300 ms) dijaga oleh YIELD per potongan,
 * bukan dengan memperkecil potongan sampai tak ekonomis.
 */
export const CHUNK_TARGET_MS = 250;
export const CHUNK_SOFT_MS = 400;

export function adaptChunkSize(current: number, elapsedMs: number): number {
  const safe = Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, Math.round(current) || DEFAULT_CHUNK_SIZE));
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return safe;
  if (elapsedMs > CHUNK_SOFT_MS) return Math.max(MIN_CHUNK_SIZE, Math.floor(safe * 0.75));
  if (elapsedMs < CHUNK_TARGET_MS / 2) return Math.min(MAX_CHUNK_SIZE, Math.ceil(safe * 1.25));
  return safe;
}

/** Batas akhir potongan berikutnya: tidak pernah melewati total, tidak pernah mundur. */
export function nextCursor(cursor: number, chunkSize: number, total: number): number {
  const safeCursor = Math.max(0, Math.min(cursor, total));
  const size = Math.max(1, Math.min(chunkSize, MAX_CHUNK_SIZE));
  return Math.min(total, safeCursor + size);
}

export function progressPercent(processed: number, total: number): number {
  if (total <= 0) return processed > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.floor((processed / total) * 100)));
}

/** Perkiraan sisa berdasarkan laju nyata (ms per baris) — bukan tebakan tetap. */
export function estimateRemainingMs(elapsedMs: number, processed: number, total: number): number | null {
  if (processed <= 0 || total <= processed) return total > 0 && processed >= total ? 0 : null;
  const perRow = elapsedMs / processed;
  return Math.max(0, Math.round(perRow * (total - processed)));
}

export type RowCounters = {
  valid: number;
  warning: number;
  needsMapping: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  skipped: number;
};

export const EMPTY_COUNTERS: RowCounters = {
  valid: 0,
  warning: 0,
  needsMapping: 0,
  invalid: 0,
  duplicates: 0,
  inserted: 0,
  skipped: 0,
};

export function addCounters(a: RowCounters, b: Partial<RowCounters>): RowCounters {
  return {
    valid: a.valid + (b.valid ?? 0),
    warning: a.warning + (b.warning ?? 0),
    needsMapping: a.needsMapping + (b.needsMapping ?? 0),
    invalid: a.invalid + (b.invalid ?? 0),
    duplicates: a.duplicates + (b.duplicates ?? 0),
    inserted: a.inserted + (b.inserted ?? 0),
    skipped: a.skipped + (b.skipped ?? 0),
  };
}

/**
 * Invarian "tanpa diam-diam" untuk pratinjau: setiap baris berakhir di satu status.
 * Baris yang belum diproses dilaporkan sebagai sisa (bukan dianggap valid).
 */
export function statusTotal(c: RowCounters, processed: number): { total: number; remaining: number } {
  const counted = c.valid + c.warning + c.needsMapping + c.invalid + c.duplicates;
  return { total: counted, remaining: Math.max(0, processed - counted) };
}

/** Job boleh diambil pekerja hanya bila belum selesai dan lease-nya bebas. */
export function isClaimable(state: JobState, lockedUntil: Date | null, now: Date): boolean {
  if (state === "QUEUED") return true;
  if (state !== "RUNNING") return false;
  return !lockedUntil || lockedUntil.getTime() <= now.getTime();
}

/** Status akhir yang boleh diminta pengguna. */
export function isTerminal(state: JobState): boolean {
  return state === "DONE" || state === "FAILED" || state === "CANCELED";
}
