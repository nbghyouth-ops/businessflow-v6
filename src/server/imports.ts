/**
 * Impor CSV: validasi (murni), deteksi duplikat, insert, dan rollback.
 *
 * Semua nama tabel/kolom berasal dari registry `src/lib/import-targets.ts`
 * (konstanta kode), bukan dari input pengguna. Nilai selalu parameterized.
 */
import { sql } from "drizzle-orm";
import {
  IMPORT_TARGETS,
  importRowKey,
  importTarget,
  importValue,
  validateImportRow,
  type ImportTargetKey,
} from "@/lib/import-targets";
import { nextNumber, type Ctx, type DB, type Tx } from "./core";

type Executor = Tx | DB;

export const IMPORT_TABLES: Record<ImportTargetKey, string> = {
  clients: "clients",
  products: "products",
  suppliers: "suppliers",
  employees: "employees",
  projects: "projects",
  tasks: "tasks",
  assets: "assets",
  booking_resources: "booking_resources",
  campaigns: "campaigns",
  warehouses: "warehouses",
  branches: "branches",
};

/** Kunci duplikat yang sudah ada di workspace untuk target tertentu. */
export async function existingImportKeys(tx: Executor, workspaceId: string, target: string): Promise<Set<string>> {
  const def = importTarget(target);
  const out = new Set<string>();
  if (!def?.unique) return out;
  const table = IMPORT_TABLES[def.key];
  const res = await tx.execute(
    sql`SELECT lower(${sql.raw(def.unique)}) AS k FROM ${sql.raw(table)} WHERE workspace_id = ${workspaceId} AND ${sql.raw(def.unique)} IS NOT NULL`,
  );
  for (const r of res.rows as Array<{ k: string | null }>) if (r.k) out.add(r.k);
  return out;
}

/**
 * Insert satu baris. Semua nilai lewat parameter posisi Drizzle; nama tabel/kolom
 * berasal dari konstanta, bukan input.
 */
export async function insertImportRow(tx: Executor, ctx: Ctx, target: string, raw: Record<string, string>): Promise<string> {
  const def = importTarget(target);
  if (!def) throw new Error("Target impor tidak dikenal.");
  const v = (c: string) => importValue(target, raw, c) || null;
  const n = (c: string) => importValue(target, raw, c) || "0";

  switch (def.key) {
    case "clients": {
      const code = await nextNumber(tx, ctx.workspaceId, "client", "CLN");
      const r = await tx.execute(sql`
        INSERT INTO clients (workspace_id, business_id, code, name, phone, email, address)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${code}, ${v("name")}, ${v("phone")}, ${v("email")}, ${v("address")})
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "products": {
      const sku = importValue(target, raw, "sku") || (await nextNumber(tx, ctx.workspaceId, "sku", "SKU"));
      const r = await tx.execute(sql`
        INSERT INTO products (workspace_id, business_id, sku, barcode, name, category, unit, price)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${sku}, ${v("barcode")}, ${v("name")}, ${v("category")}, ${v("unit") ?? "pcs"}, ${n("price")}::numeric)
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "suppliers": {
      const r = await tx.execute(sql`
        INSERT INTO suppliers (workspace_id, business_id, name, phone, email, address, notes)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${v("name")}, ${v("phone")}, ${v("email")}, ${v("address")}, ${v("notes")})
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "employees": {
      const code = await nextNumber(tx, ctx.workspaceId, "employee", "EMP");
      const r = await tx.execute(sql`
        INSERT INTO employees (workspace_id, business_id, code, name, position, department, phone, email, hire_date, salary, status)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${code}, ${v("name")}, ${v("position")}, ${v("department")}, ${v("phone")}, ${v("email")},
                ${v("hire_date")}::date, ${n("salary")}::numeric, 'active')
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "projects": {
      const r = await tx.execute(sql`
        INSERT INTO projects (workspace_id, business_id, name, budget, start_date, end_date, progress, notes)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${v("name")}, ${n("budget")}::numeric, ${v("start_date")}::date, ${v("end_date")}::date, 0, ${v("notes")})
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "tasks": {
      const r = await tx.execute(sql`
        INSERT INTO tasks (workspace_id, business_id, title, description, priority, status, due_date, assignee)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${v("title")}, ${v("description")}, ${v("priority") ?? "normal"}, 'open', ${v("due_date")}::date, ${v("assignee")})
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "assets": {
      const code = await nextNumber(tx, ctx.workspaceId, "asset", "AST");
      const r = await tx.execute(sql`
        INSERT INTO assets (workspace_id, business_id, code, name, category, location, purchase_date, cost, useful_life_months, status)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${code}, ${v("name")}, ${v("category")}, ${v("location")},
                ${v("purchase_date")}::date, ${n("cost")}::numeric, ${v("useful_life_months")}::int, 'active')
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "booking_resources": {
      const r = await tx.execute(sql`
        INSERT INTO booking_resources (workspace_id, business_id, name, kind)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${v("name")}, ${v("kind")})
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "campaigns": {
      const r = await tx.execute(sql`
        INSERT INTO campaigns (workspace_id, business_id, name, channel, budget, start_date, end_date)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${v("name")}, ${v("channel")}, ${n("budget")}::numeric, ${v("start_date")}::date, ${v("end_date")}::date)
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "warehouses": {
      const r = await tx.execute(sql`
        INSERT INTO warehouses (workspace_id, business_id, name)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${v("name")})
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
    case "branches": {
      const r = await tx.execute(sql`
        INSERT INTO branches (workspace_id, business_id, name, code, address)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${v("name")}, ${v("code")}, ${v("address")})
        RETURNING id`);
      return String((r.rows[0] as { id: string }).id);
    }
  }
}

/** Hapus semua baris hasil satu batch. Aman untuk 11 target. */
export async function rollbackImportRows(tx: Executor, workspaceId: string, target: string, ids: string[]): Promise<number> {
  const def = importTarget(target);
  if (!def || ids.length === 0) return 0;
  const table = IMPORT_TABLES[def.key];
  const safeIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!safeIds.length) return 0;
  const res = await tx.execute(
    sql`DELETE FROM ${sql.raw(table)} WHERE workspace_id = ${workspaceId} AND id = ANY(${sql.raw(`ARRAY[${safeIds.map((id) => `'${id}'::uuid`).join(",")}]`)}) RETURNING id`,
  );
  return res.rows.length;
}

export { IMPORT_TARGETS, importRowKey, importValue, validateImportRow };
