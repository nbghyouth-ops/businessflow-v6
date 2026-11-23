import { DatabaseConfigError, isTransientDbError, isUndefinedTableError } from "@/db";

/**
 * F-03 · Pemetaan kegagalan database TERPUSAT.
 * Satu tempat menentukan status HTTP, kode problem+json, pesan Indonesia, dan Retry-After.
 */
export type DbFailureKind = "config_missing" | "schema_not_ready" | "connection" | "permission" | "unknown";

export type DbFailure = {
  kind: DbFailureKind;
  status: 503 | 500;
  code: string;
  title: string;
  retryAfterSeconds: number | null;
};

const RETRY_AFTER_SECONDS = 5;

export function classifyDbFailure(err: unknown): DbFailure | null {
  if (err instanceof DatabaseConfigError) {
    return {
      kind: "config_missing",
      status: 503,
      code: "config_missing",
      title: "Database belum dikonfigurasi. Atur DATABASE_URL terlebih dahulu.",
      retryAfterSeconds: null,
    };
  }
  if (isUndefinedTableError(err)) {
    return {
      kind: "schema_not_ready",
      status: 503,
      code: "schema_not_ready",
      title: "Skema database belum siap. Jalankan migrasi lalu coba lagi.",
      retryAfterSeconds: RETRY_AFTER_SECONDS,
    };
  }
  if (isTransientDbError(err)) {
    return {
      kind: "connection",
      status: 503,
      code: "service_unavailable",
      title: "Koneksi database sedang terganggu. Kami mencoba menyambung ulang; silakan coba lagi.",
      retryAfterSeconds: RETRY_AFTER_SECONDS,
    };
  }
  const e = ((err as { cause?: unknown })?.cause ?? err) as { code?: string };
  if (e?.code === "42501") {
    return {
      kind: "permission",
      status: 500,
      code: "internal",
      title: "Terjadi kesalahan pada server.",
      retryAfterSeconds: null,
    };
  }
  return null;
}

/**
 * Retry hanya untuk operasi BACA/IDEMPOTEN (kontrak 4.1 butir 3 & F-03).
 * Penulisan non-idempoten tidak pernah diulang tanpa idempotency key.
 */
export function canRetryRead(method: string, hasIdempotencyKey: boolean): boolean {
  return method === "GET" || method === "HEAD" || hasIdempotencyKey;
}

export function retryDelayMs(attempt: number, base = 150, jitter = 75): number {
  return base * (attempt + 1) + Math.floor(Math.random() * jitter);
}

export function withRetryAfterHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "Retry-After": String(RETRY_AFTER_SECONDS), "Cache-Control": "no-store", ...extra };
}
