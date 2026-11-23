import { CANONICAL_MIGRATION_MANIFEST } from "./migrations-bundle";
import type { Pool } from "pg";

export type SchemaVerifyReason =
  | "OK"
  | "SCHEMA_NOT_MIGRATED"
  | "SCHEMA_DRIFT"
  | "RLS_MISCONFIGURED"
  | "ROLE_MISCONFIGURED";

export interface SchemaVerifyResult {
  ok: boolean;
  reason: SchemaVerifyReason;
  detail: string;
}

const REQUIRED_TABLES = [
  "schema_migrations",
  "devices",
  "device_grants",
  "tab_sessions",
  "onboarding_drafts",
  "workspaces",
  "businesses",
  "branches",
  "warehouses",
  "accounting_periods",
  "journal_entries",
  "journal_lines",
  "stock_movements",
  "invoices",
  "payments",
  "cashier_shifts",
  "export_records",
  "api_rate_limits",
  "jobs",
  "user",
  "session",
  "account",
  "verification",
  "workspace_members",
  "workspace_invitations",
  "auth_events",
];

const REQUIRED_DEVICE_COLUMNS: Array<{
  name: string;
  dataType: string;
  isNullable: "YES" | "NO";
  requiresDefault?: boolean;
}> = [
  { name: "id", dataType: "uuid", isNullable: "NO", requiresDefault: true },
  { name: "token_hash", dataType: "text", isNullable: "NO" },
  { name: "name", dataType: "text", isNullable: "NO", requiresDefault: true },
  { name: "pin_hash", dataType: "text", isNullable: "YES" },
  { name: "pin_length", dataType: "integer", isNullable: "YES" },
  { name: "failed_attempts", dataType: "integer", isNullable: "NO", requiresDefault: true },
  { name: "status", dataType: "text", isNullable: "NO", requiresDefault: true },
];

/**
 * Verifier skema READ-ONLY (BF-002, BF-003, BF-015, NF-02).
 * Tidak pernah menjalankan DDL dari jalur runtime atau health check.
 */
export async function verifyDatabaseSchemaReadOnly(pool: Pool): Promise<SchemaVerifyResult> {
  // 1. Cek tabel wajib
  const tblRes = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const existingTables = new Set(tblRes.rows.map((r) => r.table_name));
  if (!existingTables.has("schema_migrations") || !existingTables.has("devices")) {
    return {
      ok: false,
      reason: "SCHEMA_NOT_MIGRATED",
      detail: "Tabel inti belum ada. Jalankan npm run db:migrate atau drizzle/ALL_IN_ONE.sql.",
    };
  }
  const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));
  if (missingTables.length > 0) {
    return {
      ok: false,
      reason: "SCHEMA_DRIFT",
      detail: `Tabel wajib tidak lengkap (${missingTables.slice(0, 5).join(", ")}).`,
    };
  }

  // 2. Cek kolom, tipe, nullability, dan default tabel devices (deteksi drift onboarding Vercel)
  const devColsRes = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'devices'`,
  );
  const devCols = new Map(devColsRes.rows.map((r) => [r.column_name, r]));
  for (const req of REQUIRED_DEVICE_COLUMNS) {
    const col = devCols.get(req.name);
    if (!col) {
      return {
        ok: false,
        reason: "SCHEMA_DRIFT",
        detail: `Kolom devices.${req.name} hilang.`,
      };
    }
    if (col.data_type !== req.dataType || col.is_nullable !== req.isNullable) {
      return {
        ok: false,
        reason: "SCHEMA_DRIFT",
        detail: `Tipe/nullability devices.${req.name} tidak sesuai (${col.data_type}/${col.is_nullable}).`,
      };
    }
    if (req.requiresDefault && !col.column_default) {
      return {
        ok: false,
        reason: "SCHEMA_DRIFT",
        detail: `Default value devices.${req.name} tidak ada.`,
      };
    }
  }

  // 3. Cek daftar migrasi kanonis & checksum
  const migRes = await pool.query<{ id: string; checksum: string }>(
    "SELECT id, checksum FROM schema_migrations",
  );
  const applied = new Map(migRes.rows.map((r) => [r.id, r.checksum]));
  for (const m of CANONICAL_MIGRATION_MANIFEST) {
    const c = applied.get(m.id);
    if (!c) {
      return {
        ok: false,
        reason: "SCHEMA_DRIFT",
        detail: `Migrasi ${m.id} belum tercatat di schema_migrations.`,
      };
    }
    if (c !== m.checksum) {
      return {
        ok: false,
        reason: "SCHEMA_DRIFT",
        detail: `Checksum migrasi ${m.id} tidak cocok dengan versi kode.`,
      };
    }
  }

  // 4. Cek role bf_app dan membership current_user
  const roleRes = await pool.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
    is_member: boolean;
  }>(
    `SELECT rolsuper, rolbypassrls, rolcanlogin, pg_has_role(current_user, 'bf_app', 'MEMBER') AS is_member
     FROM pg_roles WHERE rolname = 'bf_app'`,
  );
  if (roleRes.rows.length === 0) {
    return {
      ok: false,
      reason: "ROLE_MISCONFIGURED",
      detail: "Role bf_app belum dibuat.",
    };
  }
  const roleRow = roleRes.rows[0];
  if (roleRow.rolsuper || roleRow.rolbypassrls || roleRow.rolcanlogin || !roleRow.is_member) {
    return {
      ok: false,
      reason: "ROLE_MISCONFIGURED",
      detail: "Konfigurasi atau keanggotaan role bf_app tidak valid.",
    };
  }

  // 5. Cek ENABLE + FORCE RLS pada seluruh tabel bertenant (memiliki workspace_id)
  const rlsRes = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND EXISTS (
         SELECT 1 FROM information_schema.columns col
         WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'workspace_id'
       )`,
  );
  const missingRls = rlsRes.rows.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity);
  if (missingRls.length > 0) {
    return {
      ok: false,
      reason: "RLS_MISCONFIGURED",
      detail: `RLS belum aktif penuh pada: ${missingRls.slice(0, 5).map((r) => r.relname).join(", ")}.`,
    };
  }

  return { ok: true, reason: "OK", detail: "Skema, migrasi, role, dan RLS valid." };
}
