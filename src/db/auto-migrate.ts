import { BUNDLED_MIGRATIONS } from "./migrations-bundle";
import { getPool, isDatabaseConfigured } from "./index";

const globalForMig = globalThis as typeof globalThis & {
  __bfSchemaReady?: boolean;
  __bfSchemaPromise?: Promise<void> | null;
  __bfSchemaFailure?: { at: number; reason: string } | null;
};

/** F-04: kegagalan migrasi runtime di-cache singkat agar tidak menjadi badai retry. */
const FAILURE_CACHE_MS = 30_000;
/** Batas waktu wajar untuk DDL (Neon bisa lambat saat cold start). */
const LOCK_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 120_000;

export class SchemaNotReadyError extends Error {
  constructor(
    public readonly reason:
      | "MIGRATION_FAILED"
      | "MIGRATION_TIMEOUT"
      | "MIGRATION_PERMISSION"
      | "CACHED_FAILURE"
      | "MIGRATION_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "SchemaNotReadyError";
  }
}

function classifyMigrationError(err: unknown): SchemaNotReadyError {
  const e = ((err as { cause?: unknown })?.cause ?? err) as { code?: string; message?: string };
  if (e?.code === "55P03" || /lock timeout/i.test(String(e?.message ?? ""))) {
    return new SchemaNotReadyError("MIGRATION_TIMEOUT", "Migrasi menunggu kunci terlalu lama.");
  }
  if (e?.code === "42501" || e?.code === "42P01" && /permission/i.test(String(e?.message ?? ""))) {
    return new SchemaNotReadyError("MIGRATION_PERMISSION", "Role database tidak memiliki izin membuat skema.");
  }
  if (e?.code === "57014") {
    return new SchemaNotReadyError("MIGRATION_TIMEOUT", "Migrasi melebihi batas waktu.");
  }
  return new SchemaNotReadyError("MIGRATION_FAILED", "Migrasi skema otomatis gagal.");
}

/**
 * BF-003: verifikasi skema TANPA menjalankan DDL. Dipakai jalur request.
 *
 * Migrasi adalah langkah deploy (`npm run db:migrate`), bukan efek samping sebuah
 * permintaan HTTP. Bila skema tertinggal, permintaan ditolak dengan 503 yang jujur
 * (schema_ready=false) alih-alih mengeksekusi DDL di dalam request pengguna.
 */
export async function assertSchemaMigrated(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (globalForMig.__bfSchemaReady) return;
  const pool = getPool();
  try {
    const [migRes, checkRes] = await Promise.all([
      pool.query<{ id: string; checksum: string }>("SELECT id, checksum FROM schema_migrations"),
      pool.query<{ has_rate: string | null; has_exp: string | null; has_prd: string | null; has_fallback: string | null }>(
        "SELECT to_regclass('public.api_rate_limits')::text AS has_rate, to_regclass('public.export_records')::text AS has_exp, to_regclass('public.cashier_shifts')::text AS has_prd, to_regclass('public.fallback_events')::text AS has_fallback",
      ),
    ]);
    const applied = new Map(migRes.rows.map((r) => [r.id, r.checksum]));
    const allPresent = BUNDLED_MIGRATIONS.every((m) => applied.get(m.id) === m.checksum);
    const objectsPresent = Boolean(
      checkRes.rows[0]?.has_rate && checkRes.rows[0]?.has_exp && checkRes.rows[0]?.has_prd && checkRes.rows[0]?.has_fallback,
    );
    if (!allPresent || !objectsPresent) {
      throw new SchemaNotReadyError(
        "MIGRATION_REQUIRED",
        "Skema database tertinggal. Jalankan `npm run db:migrate` sebelum memulai server.",
      );
    }
    globalForMig.__bfSchemaReady = true;
  } catch (err) {
    if (err instanceof SchemaNotReadyError) throw err;
    throw new SchemaNotReadyError(
      "MIGRATION_REQUIRED",
      "Skema database belum dimigrasikan. Jalankan `npm run db:migrate`.",
    );
  }
}

/**
 * Menjalankan migrasi skema + integritas + RLS secara otomatis, idempoten, dan aman
 * terhadap konkurensi (memakai pg_advisory_xact_lock di dalam transaksi, kompatibel
 * dengan Neon PgBouncer mode transaksi).
 *
 * F-04: bila gagal (izin kurang, lock timeout, checksum berubah) keadaan menjadi
 * SCHEMA_NOT_READY dengan cache kegagalan 30 detik. Migrasi tidak pernah destruktif.
 */
export async function ensureSchemaMigrated(): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const failure = globalForMig.__bfSchemaFailure;
  if (failure && Date.now() - failure.at < FAILURE_CACHE_MS) {
    throw new SchemaNotReadyError("CACHED_FAILURE", "Skema belum siap (percobaan sebelumnya gagal).");
  }

  if (globalForMig.__bfSchemaReady) return;
  if (globalForMig.__bfSchemaPromise) {
    await globalForMig.__bfSchemaPromise;
    return;
  }

  const run = async () => {
    const pool = getPool();

    // Fast-path: pastikan tabel inti DAN tabel baru ada & checksum cocok
    try {
      const [migRes, checkRes] = await Promise.all([
        pool.query<{ id: string; checksum: string }>("SELECT id, checksum FROM schema_migrations"),
        pool.query<{ has_rate: string | null; has_exp: string | null; has_prd: string | null; has_fallback: string | null }>(
          "SELECT to_regclass('public.api_rate_limits')::text AS has_rate, to_regclass('public.export_records')::text AS has_exp, to_regclass('public.cashier_shifts')::text AS has_prd, to_regclass('public.fallback_events')::text AS has_fallback",
        ),
      ]);
      const applied = new Map(migRes.rows.map((r) => [r.id, r.checksum]));
      const allPresent = BUNDLED_MIGRATIONS.every((m) => applied.get(m.id) === m.checksum);
      if (allPresent && checkRes.rows[0]?.has_rate && checkRes.rows[0]?.has_exp && checkRes.rows[0]?.has_prd && checkRes.rows[0]?.has_fallback) {
        globalForMig.__bfSchemaReady = true;
        globalForMig.__bfSchemaFailure = null;
        return;
      }
    } catch {
      // Lanjut ke transaksi migrasi
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
      await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
      await client.query("SELECT pg_advisory_xact_lock(88442211)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      for (const m of BUNDLED_MIGRATIONS) {
        // Karena semua migrasi sekarang 100% idempoten (IF NOT EXISTS / DO $$),
        // jalankan jika belum tercatat dengan checksum terbaru.
        const existing = await client.query<{ checksum: string }>(
          "SELECT checksum FROM schema_migrations WHERE id = $1",
          [m.id],
        );
        if (existing.rows[0]?.checksum === m.checksum) {
          // Khusus beberapa migrasi: pastikan objek kuncinya benar-benar ada
          if (m.id === "003_features_and_exports") {
            const chk = await client.query<{ r: string | null }>("SELECT to_regclass('public.api_rate_limits')::text AS r");
            if (chk.rows[0]?.r) continue;
          } else if (m.id === "011_fallback_resilience") {
            const chk = await client.query<{ r: string | null }>("SELECT to_regclass('public.fallback_events')::text AS r");
            if (chk.rows[0]?.r) continue;
          } else {
            continue;
          }
        }

        if (m.id === "0000_baseline") {
          const baseChk = await client.query<{ r: string | null }>("SELECT to_regclass('public.accounting_periods')::text AS r");
          if (baseChk.rows[0]?.r) {
            await client.query(
              `INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)
               ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
              [m.id, m.checksum],
            );
            continue;
          }
        }
        await client.query(m.sql);
        await client.query(
          `INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
          [m.id, m.checksum],
        );
      }

      await client.query("COMMIT");
      globalForMig.__bfSchemaReady = true;
      globalForMig.__bfSchemaFailure = null;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const mapped = classifyMigrationError(err);
      globalForMig.__bfSchemaFailure = { at: Date.now(), reason: mapped.reason };
      console.error(
        `[schema:error] ${JSON.stringify({ label: "auto_migrate_failed", reason: mapped.reason })}`,
      );
      throw mapped;
    } finally {
      client.release();
    }
  };

  globalForMig.__bfSchemaPromise = run().finally(() => {
    globalForMig.__bfSchemaPromise = null;
  });

  await globalForMig.__bfSchemaPromise;
}

export function resetSchemaFailureCache(): void {
  globalForMig.__bfSchemaFailure = null;
  globalForMig.__bfSchemaReady = false;
}
