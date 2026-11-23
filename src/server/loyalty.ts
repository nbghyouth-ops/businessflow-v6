/**
 * Layanan R11-E: voucher/loyalitas (catatan diskon), direktori supplier, dan pusat aturan.
 *
 * Semua uang dihitung dalam unit minor (bigint) memakai satu implementasi presisi
 * (`src/features/exports/precision.ts`) dan aturan diskon murni
 * (`src/features/vouchers/discount.ts`) yang diuji terpisah.
 */
import { sql } from "drizzle-orm";
import { audit, HttpError, type Ctx, type DB } from "@/server/core";
import { decimalToMinor, minorToDecimal } from "@/features/exports/precision";
import { computeVoucherDiscount } from "@/features/vouchers/discount";

export type VoucherRow = {
  id: string;
  code: string;
  kind: "percent" | "amount";
  percentBp: number | null;
  amount: string | null;
  minPurchase: string;
  maxDiscount: string | null;
  validFrom: string;
  validTo: string;
  quota: number | null;
  used: number;
  isActive: boolean;
  currency: string;
};

export async function listVouchers(tx: DB, ctx: Ctx): Promise<VoucherRow[]> {
  const res = await tx.execute(sql`
    select v.id, v.code, v.kind, v.percent_bp as "percentBp", v.amount::text as amount,
           v.min_purchase::text as "minPurchase", v.max_discount::text as "maxDiscount",
           v.valid_from::text as "validFrom", v.valid_to::text as "validTo", v.quota, v.used,
           v.is_active as "isActive", coalesce(b.currency, 'IDR') as currency
      from vouchers v join businesses b on b.id = v.business_id and b.workspace_id = v.workspace_id
     where v.workspace_id = ${ctx.workspaceId}
     order by v.created_at desc limit 200`);
  return res.rows as VoucherRow[];
}

export type CreateVoucherInput = {
  code: string;
  kind: "percent" | "amount";
  percentBp?: number | null;
  amount?: string | null;
  minPurchase?: string;
  maxDiscount?: string | null;
  validFrom: string;
  validTo: string;
  quota?: number | null;
};

export async function createVoucher(tx: DB, ctx: Ctx, input: CreateVoucherInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
    throw new HttpError(422, "Kode voucher hanya huruf/angka/underscore/strip (2–32 karakter).", "invalid_code");
  }
  if (input.validTo < input.validFrom) {
    throw new HttpError(422, "Tanggal berlaku akhir sebelum awal.", "invalid_period");
  }
  const ins = await tx.execute(sql`
    insert into vouchers
      (workspace_id, business_id, code, kind, percent_bp, amount, min_purchase, max_discount,
       valid_from, valid_to, quota, created_by)
    values (
      ${ctx.workspaceId}, ${ctx.businessId}, ${code}, ${input.kind},
      ${input.kind === "percent" ? (input.percentBp ?? null) : null},
      ${input.kind === "amount" ? (input.amount ?? null) : null}::numeric,
      ${input.minPurchase ?? "0"}::numeric, ${input.maxDiscount ?? null}::numeric,
      ${input.validFrom}::date, ${input.validTo}::date, ${input.quota ?? null}::int,
      ${ctx.userId ?? null})
    returning id`);
  const id = (ins.rows[0] as { id: string }).id;
  await audit(tx, ctx, "voucher.create", "voucher", id, {
    code,
    kind: input.kind,
    percentBp: input.percentBp ?? null,
    amount: input.amount ?? null,
    validFrom: input.validFrom,
    validTo: input.validTo,
  });
  return { id, code };
}

export type RedeemVoucherInput = {
  code: string;
  amount: string;
  invoiceId?: string | null;
  onDate?: string | null;
  note?: string | null;
};

/**
 * Catat pemakaian voucher atas penjualan yang DICATAT.
 * Tidak mengubah invoice dan tidak memindahkan uang: nilai diskon dikembalikan untuk
 * dipakai pemanggil (mis. saat mencatat penjualan) dan disimpan sebagai jejak.
 * Kuota ditegakkan atomik (UPDATE ... WHERE used < quota) agar dua permintaan paralel
 * tidak dapat memakai kuota terakhir dua kali.
 */
export async function redeemVoucher(tx: DB, ctx: Ctx, input: RedeemVoucherInput) {
  const code = input.code.trim().toUpperCase();
  const onDate = input.onDate ?? new Date().toISOString().slice(0, 10);

  const biz = (
    await tx.execute(sql`select currency from businesses where id = ${ctx.businessId} and workspace_id = ${ctx.workspaceId}`)
  ).rows[0] as { currency: string } | undefined;
  const currency = biz?.currency ?? "IDR";
  const amountMinor = decimalToMinor(input.amount, currency);

  const claimed = await tx.execute(sql`
    update vouchers set used = used + 1
     where workspace_id = ${ctx.workspaceId}
       and code = ${code}
       and is_active
       and valid_from <= ${onDate}::date
       and valid_to >= ${onDate}::date
       and (quota is null or used < quota)
    returning id, kind, percent_bp as "percentBp", amount::text as amount,
              min_purchase::text as "minPurchase", max_discount::text as "maxDiscount"`);
  const row = claimed.rows[0] as
    | { id: string; kind: "percent" | "amount"; percentBp: number | null; amount: string | null; minPurchase: string; maxDiscount: string | null }
    | undefined;
  if (!row) {
    throw new HttpError(409, "Voucher tidak aktif, kedaluwarsa, atau kuotanya habis.", "voucher_not_usable");
  }

  const outcome = computeVoucherDiscount(
    {
      kind: row.kind,
      percentBp: row.percentBp,
      amountMinor: row.amount === null ? null : decimalToMinor(row.amount, currency),
      minPurchaseMinor: decimalToMinor(row.minPurchase, currency),
      maxDiscountMinor: row.maxDiscount === null ? null : decimalToMinor(row.maxDiscount, currency),
    },
    amountMinor,
  );
  if (!outcome.ok) {
    // Kembalikan klaim kuota: voucher tidak sah untuk belanja ini.
    await tx.execute(sql`update vouchers set used = used - 1 where id = ${row.id} and workspace_id = ${ctx.workspaceId}`);
    throw new HttpError(
      422,
      outcome.reason === "below_minimum"
        ? "Nilai belanja belum mencapai minimum voucher."
        : "Voucher tidak menghasilkan diskon untuk nilai ini.",
      outcome.reason,
    );
  }

  if (input.invoiceId) {
    const owned = await tx.execute(sql`select 1 from invoices where id = ${input.invoiceId} and workspace_id = ${ctx.workspaceId}`);
    if (!owned.rows.length) throw new HttpError(404, "Invoice tidak ditemukan di workspace ini.", "not_found");
  }

  const ins = await tx.execute(sql`
    insert into voucher_redemptions
      (workspace_id, business_id, voucher_id, invoice_id, amount_before, discount_amount, currency, note, created_by)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${row.id}, ${input.invoiceId ?? null},
            ${minorToDecimal(amountMinor, currency)}::numeric,
            ${minorToDecimal(outcome.discountMinor, currency)}::numeric,
            ${currency}, ${input.note ?? null}, ${ctx.userId ?? null})
    returning id`);
  const redemptionId = (ins.rows[0] as { id: string }).id;
  await audit(tx, ctx, "voucher.redeem", "voucher_redemption", redemptionId, {
    code,
    discountMinor: outcome.discountMinor.toString(),
    invoiceId: input.invoiceId ?? null,
  });

  return {
    redemptionId,
    code,
    currency,
    discountMinor: outcome.discountMinor.toString(),
    discount: minorToDecimal(outcome.discountMinor, currency),
    amountMinor: amountMinor.toString(),
  };
}

/* ───────────────────────── Supplier ───────────────────────── */

export async function listSuppliers(tx: DB, ctx: Ctx) {
  const res = await tx.execute(sql`
    select id, name, phone, email, address, notes, is_active as "isActive", created_at as "createdAt"
      from suppliers where workspace_id = ${ctx.workspaceId}
     order by is_active desc, name limit 500`);
  return res.rows;
}

export type SupplierInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

export async function createSupplier(tx: DB, ctx: Ctx, input: SupplierInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new HttpError(422, "Nama supplier minimal 2 karakter.", "invalid_name");
  const ins = await tx.execute(sql`
    insert into suppliers (workspace_id, business_id, name, phone, email, address, notes)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${name}, ${input.phone ?? null}, ${input.email ?? null},
            ${input.address ?? null}, ${input.notes ?? null})
    returning id`);
  const id = (ins.rows[0] as { id: string }).id;
  await audit(tx, ctx, "supplier.create", "supplier", id, { name });
  return { id, name };
}

export async function updateSupplier(tx: DB, ctx: Ctx, id: string, input: Partial<SupplierInput> & { isActive?: boolean }) {
  const res = await tx.execute(sql`
    update suppliers set
      name = coalesce(${input.name?.trim() ?? null}, name),
      phone = coalesce(${input.phone ?? null}, phone),
      email = coalesce(${input.email ?? null}, email),
      address = coalesce(${input.address ?? null}, address),
      notes = coalesce(${input.notes ?? null}, notes),
      is_active = coalesce(${input.isActive ?? null}, is_active)
     where id = ${id} and workspace_id = ${ctx.workspaceId}
    returning id, name, is_active as "isActive"`);
  const row = res.rows[0];
  if (!row) throw new HttpError(404, "Supplier tidak ditemukan di workspace ini.", "not_found");
  await audit(tx, ctx, "supplier.update", "supplier", id, { ...input });
  return row;
}

/* ───────────────────────── Pusat aturan ───────────────────────── */

export type WorkspaceRules = {
  forecastDefaultWeeks: number;
  lowStockThreshold: string;
  invoiceDueDays: number;
  updatedAt: string | null;
};

/**
 * `numeric(18,3)` mengembalikan "5.000"; API harus memberi bentuk kanonik "5" agar
 * nilai bawaan (tanpa baris) dan nilai tersimpan tidak pernah berbeda tampilan.
 */
function normalizeQty(text: string): string {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

const DEFAULT_RULES: WorkspaceRules = {
  forecastDefaultWeeks: 13,
  lowStockThreshold: "5",
  invoiceDueDays: 14,
  updatedAt: null,
};

export async function getWorkspaceRules(tx: DB, ctx: Ctx): Promise<WorkspaceRules> {
  const res = await tx.execute(sql`
    select forecast_default_weeks as "forecastDefaultWeeks", low_stock_threshold::text as "lowStockThreshold",
           invoice_due_days as "invoiceDueDays", updated_at::text as "updatedAt"
      from workspace_rules where workspace_id = ${ctx.workspaceId}`);
  const row = res.rows[0] as WorkspaceRules | undefined;
  if (!row) return DEFAULT_RULES;
  return { ...row, lowStockThreshold: normalizeQty(row.lowStockThreshold) };
}

export async function setWorkspaceRules(tx: DB, ctx: Ctx, input: Partial<Omit<WorkspaceRules, "updatedAt">>) {
  const current = await getWorkspaceRules(tx, ctx);
  const next = { ...current, ...input };
  const ins = await tx.execute(sql`
    insert into workspace_rules
      (workspace_id, business_id, forecast_default_weeks, low_stock_threshold, invoice_due_days, updated_at, updated_by)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${next.forecastDefaultWeeks}, ${next.lowStockThreshold}::numeric,
            ${next.invoiceDueDays}, now(), ${ctx.userId ?? null})
    on conflict (workspace_id) do update set
      forecast_default_weeks = excluded.forecast_default_weeks,
      low_stock_threshold = excluded.low_stock_threshold,
      invoice_due_days = excluded.invoice_due_days,
      updated_at = now(),
      updated_by = excluded.updated_by
    returning forecast_default_weeks as "forecastDefaultWeeks", low_stock_threshold::text as "lowStockThreshold",
              invoice_due_days as "invoiceDueDays", updated_at::text as "updatedAt"`);
  await audit(tx, ctx, "rules.update", "workspace_rules", ctx.workspaceId, { ...input });
  const saved = ins.rows[0] as WorkspaceRules;
  return { ...saved, lowStockThreshold: normalizeQty(saved.lowStockThreshold) };
}
