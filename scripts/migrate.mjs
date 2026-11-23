import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { CANONICAL_MIGRATIONS } from "./migrations-manifest.mjs";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

export function buildPgConfig(rawUrl) {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error("DATABASE_URL wajib diisi sebelum menjalankan migrasi.");
  }
  const parsed = new URL(rawUrl.trim());
  const host = parsed.hostname.toLowerCase();
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  const isNeon = host.includes("neon.tech") || host.includes("neon.build");
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (isNeon || sslMode) {
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("channel_binding");
  }
  const needsSsl = isNeon || (sslMode !== undefined && sslMode !== "disable") || (!isLocal && sslMode !== "disable");
  return {
    connectionString: parsed.toString(),
    max: 2,
    connectionTimeoutMillis: 15_000,
    ssl: needsSsl ? { rejectUnauthorized: true } : false,
  };
}

export const MIGRATION_FILES = CANONICAL_MIGRATIONS.map((m) => m.path);

async function main() {
  loadDotEnv();
  const pool = new Pool(buildPgConfig(process.env.DATABASE_URL));
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const m of CANONICAL_MIGRATIONS) {
      const abs = resolve(process.cwd(), m.path);
      if (!existsSync(abs)) {
        console.log(`[skip] ${m.id} (${m.path} belum ada)`);
        continue;
      }
      const sql = readFileSync(abs, "utf8");
      const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");

      const existing = await pool.query(
        "SELECT id, checksum FROM schema_migrations WHERE id = $1 OR id = $2",
        [m.id, m.legacyId],
      );
      if (existing.rows.length > 0) {
        const found = existing.rows.find((r) => r.id === m.id) || existing.rows[0];
        if (found.checksum !== checksum) {
          throw new Error(`Checksum mismatch pada ${m.id} (${m.path})! File migrasi yang sudah diterapkan tidak boleh diubah.`);
        }
        console.log(`[ok]   ${m.id} (sudah diterapkan)`);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum",
          [m.id, checksum],
        );
        // Catatan: baris alias `legacyId` (path berkas) TIDAK lagi ditulis pada DB baru.
        // Baris lama tetap dikenali saat pengecekan (`WHERE id = $1 OR id = $2`), tetapi
        // menghitungnya sebagai migrasi terpisah membuat `db:check` melaporkan 28 migrasi
        // padahal hanya ada 14 — angka yang menyesatkan pemilik.
        await client.query("COMMIT");
        console.log(`[apply] ${m.id} (${m.path})`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Gagal menerapkan ${m.id} (${m.path}): ${err.message}`);
      } finally {
        client.release();
      }
    }
    console.log("Semua migrasi selesai.");
  } finally {
    await pool.end();
  }
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[migrate] ERROR:", err.message);
    process.exit(1);
  });
}
