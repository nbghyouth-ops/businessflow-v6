import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { buildPgConfig } from "./migrate.mjs";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function maskUrl(raw) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.username ? "***:***@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}

async function main() {
  loadDotEnv();
  const raw = process.env.DATABASE_URL;
  if (!raw?.trim()) {
    console.error("[FAIL] DATABASE_URL belum diatur.");
    process.exit(1);
  }
  console.log(`Target DB: ${maskUrl(raw)}`);
  const pool = new Pool(buildPgConfig(raw));
  let failed = false;

  try {
    await pool.query("SELECT 1");
    console.log("[PASS] Koneksi PostgreSQL berhasil");

    const migs = await pool.query("SELECT id FROM schema_migrations ORDER BY applied_at");
    console.log(`[INFO] Migrasi tercatat: ${migs.rows.length}`);

    // Hitung dari katalog (bukan information_schema) agar hasil sama untuk role apa pun —
    // information_schema menyembunyikan tabel tanpa hak akses sehingga angka menyesatkan.
    const tables = await pool.query(`
      SELECT count(*)::int AS n FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    console.log(`[INFO] Total tabel public: ${tables.rows[0].n}`);
    if (tables.rows[0].n < 40) {
      console.error("[FAIL] Jumlah tabel kurang dari yang diharapkan. Jalankan npm run db:migrate.");
      failed = true;
    }

    const triggers = await pool.query(`
      SELECT tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
    `);
    console.log(`[INFO] Trigger integritas aktif: ${triggers.rows.length}`);

    const roleRes = await pool.query(`
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
      FROM pg_roles WHERE rolname = 'bf_app'
    `);
    if (roleRes.rows.length === 0) {
      console.error("[FAIL] Role bf_app belum ada. Jalankan migrasi RLS (002_rls_and_tenant_fk.sql).");
      failed = true;
    } else {
      const r = roleRes.rows[0];
      if (r.rolsuper || r.rolbypassrls || r.rolcanlogin) {
        console.error("[FAIL] Role bf_app harus NOLOGIN, bukan superuser, dan NOBYPASSRLS.");
        failed = true;
      } else {
        console.log("[PASS] Role bf_app terkonfigurasi aman (NOLOGIN, NOBYPASSRLS)");
      }
    }

    // G-2: laporkan apakah role KONEKSI masih bisa melewati RLS (tanpa DSN/nama rahasia).
    const conn = await pool.query(`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `);
    const role = conn.rows[0] ?? {};
    const runtime = role.rolsuper || role.rolbypassrls ? "bypass_risk" : "enforce";
    console.log(`[INFO] rls_runtime: ${runtime} (superuser=${!!role.rolsuper}, bypassrls=${!!role.rolbypassrls})`);
    if (runtime === "bypass_risk") {
      console.log("[WARN] Role koneksi dapat melewati RLS. Untuk produksi gunakan role LOGIN NOBYPASSRLS (lihat PANDUAN_DEPLOY_PEMILIK.md).");
    }

    const rlsRes = await pool.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'workspace_id'
        )
      ORDER BY c.relname
    `);
    const missingRls = rlsRes.rows.filter((x) => !x.relrowsecurity || !x.relforcerowsecurity);
    if (missingRls.length > 0) {
      console.error(`[FAIL] Tabel bertenant belum ENABLE+FORCE RLS: ${missingRls.map((x) => x.relname).join(", ")}`);
      failed = true;
    } else {
      console.log(`[PASS] Semua ${rlsRes.rows.length} tabel bertenant memiliki ENABLE + FORCE RLS`);
    }

    if (failed) process.exit(1);
    console.log("[PASS] Preflight database OK.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[preflight] ERROR:", err.message);
  process.exit(1);
});
