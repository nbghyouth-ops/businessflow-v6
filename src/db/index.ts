import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool, type PoolConfig } from "pg";

export class DatabaseConfigError extends Error {
  constructor(
    public readonly reason: "DATABASE_URL_MISSING" | "DATABASE_URL_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __bfPgPool?: Pool;
  __bfDrizzle?: NodePgDatabase;
};

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Normalizes Neon & standard PostgreSQL connection strings without requiring
 * a second ENV var. Handles `-pooler` hosts, `sslmode=require`, and
 * `channel_binding=require` cleanly without emitting pg sslmode warnings.
 */
export function buildPoolConfig(rawUrl: string): PoolConfig {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new DatabaseConfigError("DATABASE_URL_MISSING", "DATABASE_URL belum diatur.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new DatabaseConfigError("DATABASE_URL_INVALID", "Format DATABASE_URL tidak valid.");
  }

  const host = parsed.hostname.toLowerCase();
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  const isNeon = host.includes("neon.tech") || host.includes("neon.build");
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";

  // Remove query params that trigger pg deprecation/sslmode warnings when handled via `ssl` option
  if (isNeon || sslMode) {
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("channel_binding");
  }

  const needsSsl = isNeon || (sslMode !== undefined && sslMode !== "disable") || (!isLocal && sslMode !== "disable");

  return {
    connectionString: parsed.toString(),
    // Pool 5 terlalu sempit untuk "banyak client bersamaan" (R17 §A7): satu job impor
    // memegang koneksi per potongan, sementara permintaan pengguna lain menunggu.
    // 12 dapat dinaikkan lewat ENV opsional BF_PG_POOL_MAX (bukan ENV wajib baru).
    max: Math.max(2, Number(process.env.BF_PG_POOL_MAX ?? 12) || 12),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 12_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: true } : false,
  };
}

export function getPool(): Pool {
  if (globalForDb.__bfPgPool) return globalForDb.__bfPgPool;
  const raw = process.env.DATABASE_URL;
  if (!raw?.trim()) {
    throw new DatabaseConfigError("DATABASE_URL_MISSING", "DATABASE_URL belum diatur.");
  }
  const p = new Pool(buildPoolConfig(raw));
  globalForDb.__bfPgPool = p;
  return p;
}

function getDrizzle(): NodePgDatabase {
  if (!globalForDb.__bfDrizzle) {
    globalForDb.__bfDrizzle = drizzle(getPool());
  }
  return globalForDb.__bfDrizzle;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const p = getPool();
    const val = Reflect.get(p, prop, p);
    return typeof val === "function" ? val.bind(p) : val;
  },
});

export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const d = getDrizzle();
    const val = Reflect.get(d, prop, d);
    return typeof val === "function" ? val.bind(d) : val;
  },
});

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EPIPE",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "08007", // transaction_resolution_unknown
  "53300", // too_many_connections
  "53200", // out_of_memory
]);

export function isTransientDbError(err: unknown): boolean {
  const e = ((err as { cause?: unknown })?.cause ?? err) as { code?: string; message?: string };
  if (e?.code && TRANSIENT_CODES.has(e.code)) return true;
  const msg = String(e?.message ?? "");
  return /Connection terminated|timeout expired|timeout exceeded when trying to connect|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|too many connections|pool is closed|client has encountered a connection error|terminating connection/i.test(
    msg,
  );
}

export function isUndefinedTableError(err: unknown): boolean {
  const e = ((err as { cause?: unknown })?.cause ?? err) as { code?: string };
  return e?.code === "42P01";
}

export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientDbError(err)) {
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** Apakah role koneksi runtime masih bisa melewati RLS (superuser / BYPASSRLS). */
export type RlsRuntime = "enforce" | "bypass_risk";

export type DbHealthStatus =
  | { ok: true; latencyMs: number; rlsRuntime: RlsRuntime }
  | {
      ok: false;
      reason:
        | "DATABASE_URL_MISSING"
        | "DATABASE_URL_INVALID"
        | "SCHEMA_NOT_MIGRATED"
        | "SCHEMA_NOT_READY"
        | "CONNECTION_ERROR";
      rlsRuntime?: RlsRuntime;
    };

/** Aman: hanya melaporkan status, tanpa nama role, DSN, atau host. Gagal → bypass_risk (fail-closed). */
async function detectRlsRuntime(): Promise<RlsRuntime> {
  try {
    const res = await withDbRetry(
      () => getDrizzle().execute(sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`),
      1,
    );
    const row = (res.rows?.[0] ?? {}) as { rolsuper?: boolean; rolbypassrls?: boolean };
    return row.rolsuper || row.rolbypassrls ? "bypass_risk" : "enforce";
  } catch {
    return "bypass_risk";
  }
}

export async function checkDatabaseHealth(): Promise<DbHealthStatus> {
  if (!isDatabaseConfigured()) {
    return { ok: false, reason: "DATABASE_URL_MISSING" };
  }
  const startedAt = Date.now();
  try {
    const { assertSchemaMigrated, SchemaNotReadyError } = await import("./auto-migrate");
    try {
      await assertSchemaMigrated();
    } catch (err) {
      if (err instanceof SchemaNotReadyError) return { ok: false, reason: "SCHEMA_NOT_READY" };
      throw err;
    }
    await withDbRetry(() => getDrizzle().execute(sql`SELECT 1 FROM businesses LIMIT 1`), 1);
    return { ok: true, latencyMs: Date.now() - startedAt, rlsRuntime: await detectRlsRuntime() };
  } catch (err) {
    if (err instanceof DatabaseConfigError) {
      return { ok: false, reason: err.reason };
    }
    if (isUndefinedTableError(err)) {
      return { ok: false, reason: "SCHEMA_NOT_MIGRATED" };
    }
    return { ok: false, reason: "CONNECTION_ERROR" };
  }
}
