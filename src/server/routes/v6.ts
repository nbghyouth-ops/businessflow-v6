import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bridgeMappings,
  bridgePostings,
  businesses,
  cashAccounts,
  coaAccounts,
  learningProgress,
  marketplaceChannels,
  marketplaceListings,
  marketplaceOrders,
  marketplaceSettlements,
  personalAccounts,
  personalBudgets,
  personalGoals,
  personalTransactions,
  products,
  rfqQuotes,
  rfqRequests,
  storefronts,
} from "@/db/schema";
import { fromCents, toCents } from "@/lib/money";
import { ensureSystemAccount, postJournal } from "../accounting";
import { buildForecast, cashHealth } from "../engine/forecast";
import { grossProfit, marginBp, netProfit, netSales } from "../engine/metrics";
import { existingImportKeys, importRowKey, validateImportRow } from "../imports";
import { commitRecording } from "../imports-commit";
import { advanceJob, cancelJob, enqueueImportJob, loadJob, resumeJob, toProgress } from "../jobs/import-jobs";
import { buildPreview, inspectUpload, MAX_ROWS, REPORT_CATALOG, WRITABLE_REPORT_TYPES } from "../imports-record";
import { PROVIDER_CONTEXTS, SUPPORTED_EXTENSIONS, reportType } from "@/features/imports/canonical-fields";
import { IMPORT_TARGET_KEYS, normalizeImportRow } from "@/lib/import-targets";
import { audit, getBusiness, HttpError, idempotent, nextNumber, r, todayIn, type DB, type Route, type Tx } from "../core";
import {
  classifyBankLine, createBankAlias, createReconciliationMatch, linkOrderToDocument, listBankAliases, listBankLines,
  listOrderLinks, listReconciliationMatches, reconciliationCandidates, setSkuMapping, skuMappingOverview, unmatchReconciliation,
} from "../marketplace-t3";
import {
  createSupplier, createVoucher, getWorkspaceRules, listSuppliers, listVouchers, redeemVoucher,
  setWorkspaceRules, updateSupplier,
} from "../loyalty";

/* ───────────── skema masukan bersama ───────────── */
const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");
const moneyStr = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Nominal tidak valid"),
);
const optMoney = moneyStr.optional();
const qtyStr = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z.string().regex(/^\d{1,15}(\.\d{1,3})?$/, "Kuantitas tidak valid"),
);

const ORDER_STATUS = ["pending", "paid", "shipped", "settled", "cancelled"] as const;
const RFQ_STATUS = ["open", "quoted", "accepted", "closed", "cancelled"] as const;

/* ───────────── skema impor generik (R11-A) ───────────── */
const parsingSchema = z.object({
  decimalHint: z.enum(["auto", "comma", "dot"]).default("auto"),
  dateFormat: z.enum(["auto", "dmy", "mdy"]).default("auto"),
  sourceTimeZone: z.string().min(1).max(64),
  currencyCode: z.string().max(8).optional(),
  amountRule: z.enum(["single", "debit_credit", "signed", "unspecified"]).optional(),
});
const mappingSchema = z.record(z.string(), z.string());
const recordingInput = z.object({
  reportType: z.string().min(1).max(40),
  providerCode: z.string().max(40).optional(),
  providerLabel: z.string().max(80).optional(),
  sourceLabel: z.string().max(80).optional(),
  filename: z.string().trim().min(1).max(200),
  sheetName: z.string().trim().min(1).max(120),
  headerRow: z.number().int().min(0).max(10_000),
  mapping: mappingSchema,
  parsing: parsingSchema,
  text: z.string().max(4_000_000).optional(),
  base64: z.string().max(6_000_000).optional(),
  channelId: uuid.optional(),
  cashAccountId: uuid.optional(),
  /** Alias rekening terdaftar; wajib untuk domain bank (dipilih pengguna, bukan ditebak). */
  bankAliasId: uuid.optional(),
  profileId: uuid.optional(),
  profileVersion: z.number().int().min(1).optional(),
});
const profileInput = z.object({
  name: z.string().trim().min(1).max(120),
  reportType: z.string().min(1).max(40),
  providerCode: z.string().max(40).optional(),
  sourceLabel: z.string().max(80).optional(),
  fileFormat: z.enum(["csv", "xlsx", "any"]).default("any"),
  snapshot: z.object({
    sheetName: z.string().max(120).nullable(),
    headerRow: z.number().int().min(0),
    mapping: mappingSchema,
    parsing: parsingSchema,
  }),
});

/** Net = bruto − diskon − biaya platform − ongkir. Gagal bila negatif (tidak boleh diam-diam nol). */
function netOf(gross: string, discount: string, fee: string, shipping: string): string {
  const v = toCents(gross) - toCents(discount) - toCents(fee) - toCents(shipping);
  if (v < 0n) throw new HttpError(422, "Penerimaan bersih negatif: periksa diskon/biaya platform.", "negative_net");
  return fromCents(v);
}

/** Persentase aman untuk tampilan (bukan perhitungan uang). Penyebut nol → N/A. */
function pct(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return "N/A";
  return (Number((numerator * 10000n) / denominator) / 100).toFixed(2);
}

async function needChannel(tx: DB, workspaceId: string, id: string) {
  const [c] = await tx
    .select()
    .from(marketplaceChannels)
    .where(and(eq(marketplaceChannels.id, id), eq(marketplaceChannels.workspaceId, workspaceId)));
  if (!c) throw new HttpError(422, "Kanal marketplace tidak ditemukan.", "bad_channel");
  return c;
}

export const v6Routes: Route[] = [
  /* ───────────── Marketplace: kanal ───────────── */
  r("GET", "/v6/marketplace/channels", { perm: "marketplace:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      select c.id, c.name, c.kind, c.fee_percent::text as "feePercent", c.is_active as "isActive",
        (select count(*)::int from marketplace_orders o where o.workspace_id = c.workspace_id and o.channel_id = c.id
          and o.published_at is not null) as "orderCount",
        (select count(*)::int from marketplace_listings l where l.workspace_id = c.workspace_id and l.channel_id = c.id) as "listingCount"
      from marketplace_channels c where c.workspace_id = ${ctx.workspaceId} order by c.created_at`);
    return { items: res.rows };
  }),

  r("POST", "/v6/marketplace/channels", { perm: "marketplace:write" }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({
      name: z.string().trim().min(1).max(60),
      kind: z.enum(["shopee", "tokopedia", "tiktok", "manual"]).default("manual"),
      feePercent: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).default("0"),
    }));
    const [row] = await tx.insert(marketplaceChannels).values({
      workspaceId: ctx.workspaceId, businessId: ctx.businessId, name: b.name, kind: b.kind, feePercent: b.feePercent,
    }).returning();
    await audit(tx, ctx, "create", "marketplace_channel", row.id);
    return { item: row };
  }),

  r("PATCH", "/v6/marketplace/channels/:id", { perm: "marketplace:write" }, async ({ ctx, params, json, tx }) => {
    const b = await json(z.object({
      name: z.string().trim().min(1).max(60).optional(),
      feePercent: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
      isActive: z.boolean().optional(),
    }));
    const [row] = await tx.update(marketplaceChannels).set(b)
      .where(and(eq(marketplaceChannels.id, params.id), eq(marketplaceChannels.workspaceId, ctx.workspaceId))).returning();
    if (!row) throw new HttpError(404, "Kanal tidak ditemukan", "not_found");
    await audit(tx, ctx, "update", "marketplace_channel", row.id);
    return { item: row };
  }),

  // Tidak ada rute kredensial/penyambungan kanal: aplikasi tidak menyimpan kunci API dan
  // tidak menyinkronkan apa pun ke marketplace (prompt R7-C §1, larangan L1–L7).

  /* ───────────── Marketplace: listing ───────────── */
  r("GET", "/v6/marketplace/listings", { perm: "marketplace:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      select l.id, l.channel_id as "channelId", c.name as "channelName", l.product_id as "productId", p.name as "productName",
        p.sku, l.external_sku as "externalSku", l.price::text as price, l.stock_buffer::text as "stockBuffer", l.status
      from marketplace_listings l
      join marketplace_channels c on c.id = l.channel_id
      join products p on p.id = l.product_id
      where l.workspace_id = ${ctx.workspaceId} order by p.name, c.name`);
    return { items: res.rows };
  }),

  r("POST", "/v6/marketplace/listings", { perm: "marketplace:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      channelId: uuid, productId: uuid, externalSku: z.string().trim().max(80).optional().nullable(),
      price: moneyStr, stockBuffer: qtyStr.default("0"),
    }));
    await needChannel(tx, ctx.workspaceId, b.channelId);
    const [p] = await tx.select({ id: products.id }).from(products)
      .where(and(eq(products.id, b.productId), eq(products.workspaceId, ctx.workspaceId)));
    if (!p) throw new HttpError(422, "Produk tidak ditemukan pada bisnis ini.", "bad_product");
    return idempotent(tx as unknown as Tx, ctx, idemKey, async () => {
      const [row] = await tx.insert(marketplaceListings).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, channelId: b.channelId, productId: b.productId,
        externalSku: b.externalSku ?? null, price: b.price, stockBuffer: b.stockBuffer,
      }).returning();
      await audit(tx, ctx, "create", "marketplace_listing", row.id);
      return { item: row };
    });
  }),

  r("PATCH", "/v6/marketplace/listings/:id", { perm: "marketplace:write" }, async ({ ctx, params, json, tx }) => {
    const b = await json(z.object({ status: z.enum(["active", "paused", "ended"]).optional(), price: moneyStr.optional() }));
    const [row] = await tx.update(marketplaceListings).set(b)
      .where(and(eq(marketplaceListings.id, params.id), eq(marketplaceListings.workspaceId, ctx.workspaceId))).returning();
    if (!row) throw new HttpError(404, "Listing tidak ditemukan", "not_found");
    return { item: row };
  }),

  /* ───────────── Marketplace: pesanan ───────────── */
  r("GET", "/v6/marketplace/orders", { perm: "marketplace:read" }, async ({ ctx, query, tx }) => {
    const from = query.get("from") || null;
    const to = query.get("to") || null;
    const channelId = query.get("channelId") || null;
    for (const v of [from, to]) if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(422, "Rentang tanggal tidak valid");
    if (channelId && !uuid.safeParse(channelId).success) throw new HttpError(422, "Kanal tidak valid");
    const limit = Math.min(Number(query.get("limit") ?? 200) || 200, 500);
    const res = await tx.execute(sql`
      select o.id, o.order_no as "orderNo", o.occurred_on::text as "occurredOn", o.gross_amount::text as "grossAmount",
        o.discount::text as discount, o.platform_fee::text as "platformFee", o.shipping_cost::text as "shippingCost",
        o.net_amount::text as "netAmount", o.status, o.note, o.channel_id as "channelId", c.name as "channelName"
      from marketplace_orders o join marketplace_channels c on c.id = o.channel_id
      where o.workspace_id = ${ctx.workspaceId} and o.published_at is not null
        and (${from}::date is null or o.occurred_on >= ${from}::date)
        and (${to}::date is null or o.occurred_on <= ${to}::date)
        and (${channelId}::uuid is null or o.channel_id = ${channelId}::uuid)
      order by o.occurred_on desc, o.created_at desc limit ${limit}`);
    return { items: res.rows };
  }),

  r("POST", "/v6/marketplace/orders", { perm: "marketplace:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      channelId: uuid,
      orderNo: z.string().trim().min(1).max(80),
      occurredOn: dateStr,
      grossAmount: moneyStr,
      discount: optMoney,
      platformFee: optMoney,
      shippingCost: optMoney,
      note: z.string().trim().max(500).optional().nullable(),
    }));
    const net = netOf(b.grossAmount, b.discount ?? "0", b.platformFee ?? "0", b.shippingCost ?? "0");
    await needChannel(tx, ctx.workspaceId, b.channelId);
    return idempotent(tx as unknown as Tx, ctx, idemKey, async () => {
      const [row] = await tx.insert(marketplaceOrders).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, channelId: b.channelId, orderNo: b.orderNo,
        occurredOn: b.occurredOn, grossAmount: b.grossAmount, discount: b.discount ?? "0",
        platformFee: b.platformFee ?? "0", shippingCost: b.shippingCost ?? "0", netAmount: net, note: b.note ?? null,
      }).returning();
      // Pesanan yang dicatat manual langsung terbit (bukan bagian job impor yang
      // belum selesai) sehingga ringkasan/laporan melihatnya saat itu juga.
      await tx.execute(sql`update marketplace_orders set published_at = now() where workspace_id = ${ctx.workspaceId} and id = ${row.id}`);
      await audit(tx, ctx, "create", "marketplace_order", row.id, { channel: b.channelId });
      return { item: row };
    });
  }),

  r("PATCH", "/v6/marketplace/orders/:id", { perm: "marketplace:write" }, async ({ ctx, params, json, tx }) => {
    const b = await json(z.object({ status: z.enum(ORDER_STATUS) }));
    const [row] = await tx.update(marketplaceOrders).set({ status: b.status })
      .where(and(eq(marketplaceOrders.id, params.id), eq(marketplaceOrders.workspaceId, ctx.workspaceId))).returning();
    if (!row) throw new HttpError(404, "Pesanan tidak ditemukan", "not_found");
    return { item: row };
  }),

  r("GET", "/v6/marketplace/summary", { perm: "marketplace:read" }, async ({ ctx, query, tx }) => {
    const from = query.get("from") || null;
    const to = query.get("to") || null;
    const res = await tx.execute(sql`
      select c.id as "channelId", c.name as "channelName", c.fee_percent::text as "feePercent",
        count(o.id)::int as "orderCount",
        coalesce(sum(o.gross_amount),0)::text as gross,
        coalesce(sum(o.discount),0)::text as discount,
        coalesce(sum(o.platform_fee),0)::text as fee,
        coalesce(sum(o.shipping_cost),0)::text as shipping,
        coalesce(sum(o.net_amount),0)::text as net
      from marketplace_channels c
      left join marketplace_orders o on o.channel_id = c.id and o.workspace_id = c.workspace_id
        and o.status <> 'cancelled' and o.published_at is not null
        and (${from}::date is null or o.occurred_on >= ${from}::date)
        and (${to}::date is null or o.occurred_on <= ${to}::date)
      where c.workspace_id = ${ctx.workspaceId}
      group by c.id, c.name, c.fee_percent order by c.name`);
    const totals = { gross: 0n, fee: 0n, net: 0n };
    for (const row of res.rows as Array<{ gross: string; fee: string; net: string }>) {
      totals.gross += toCents(row.gross); totals.fee += toCents(row.fee); totals.net += toCents(row.net);
    }
    return {
      items: res.rows,
      totals: { gross: fromCents(totals.gross), fee: fromCents(totals.fee), net: fromCents(totals.net) },
    };
  }),

  r("GET", "/v6/marketplace/settlements", { perm: "marketplace:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      select s.id, s.channel_id as "channelId", c.name as "channelName", s.period_start::text as "periodStart",
        s.period_end::text as "periodEnd", s.gross_amount::text as gross, s.fee_amount::text as fee,
        s.net_amount::text as net, s.status, s.received_on::text as "receivedOn", s.journal_id as "journalId", s.note
      from marketplace_settlements s join marketplace_channels c on c.id = s.channel_id
      where s.workspace_id = ${ctx.workspaceId} order by s.period_end desc limit 200`);
    return { items: res.rows };
  }),

  r("POST", "/v6/marketplace/settlements", { perm: "marketplace:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      channelId: uuid,
      periodStart: dateStr,
      periodEnd: dateStr,
      grossAmount: moneyStr,
      feeAmount: optMoney,
      netAmount: moneyStr,
      cashAccountId: uuid.optional().nullable(),
      receivedOn: dateStr.optional(),
      note: z.string().trim().max(500).optional().nullable(),
    }));
    if (b.periodEnd < b.periodStart) throw new HttpError(422, "Periode settlement tidak valid: akhir sebelum mulai.", "bad_period");
    const expected = toCents(b.grossAmount) - toCents(b.feeAmount ?? "0");
    if (expected !== toCents(b.netAmount)) {
      throw new HttpError(422, "Net settlement harus sama dengan bruto − biaya.", "settlement_mismatch");
    }
    await needChannel(tx, ctx.workspaceId, b.channelId);
    const biz = await getBusiness(tx, ctx);
    return idempotent(tx as unknown as Tx, ctx, idemKey, async () => {
      let journalId: string | null = null;
      let status = "recorded";
      if (b.cashAccountId) {
        const [acc] = await tx.select().from(cashAccounts)
          .where(and(eq(cashAccounts.id, b.cashAccountId), eq(cashAccounts.workspaceId, ctx.workspaceId)));
        if (!acc) throw new HttpError(422, "Akun kas penerima settlement tidak ditemukan.", "bad_account");
        const revenue = await ensureSystemAccount(tx as unknown as Tx, ctx, { subtype: "marketplace_revenue", code: "4104", name: "Pendapatan Marketplace", type: "revenue" });
        const feeAcc = await ensureSystemAccount(tx as unknown as Tx, ctx, { subtype: "marketplace_fee", code: "6109", name: "Biaya Platform Marketplace", type: "expense" });
        const lines: Array<{ accountId: string; debit?: string; credit?: string }> = [
          { accountId: acc.coaAccountId, debit: b.netAmount },
        ];
        if (toCents(b.feeAmount ?? "0") > 0n) lines.push({ accountId: feeAcc, debit: b.feeAmount ?? "0" });
        lines.push({ accountId: revenue, credit: b.grossAmount });
        journalId = await postJournal(tx as unknown as Tx, ctx, {
          date: b.receivedOn ?? todayIn(biz.timezone),
          memo: `Settlement marketplace ${b.periodStart} s.d. ${b.periodEnd}`,
          source: "marketplace_settlement",
          lines,
        });
        status = "received";
      }
      const [row] = await tx.insert(marketplaceSettlements).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, channelId: b.channelId,
        periodStart: b.periodStart, periodEnd: b.periodEnd, grossAmount: b.grossAmount,
        feeAmount: b.feeAmount ?? "0", netAmount: b.netAmount, status,
        receivedOn: b.receivedOn ?? (b.cashAccountId ? todayIn(biz.timezone) : null),
        journalId, note: b.note ?? null,
      }).returning();
      await audit(tx, ctx, "create", "marketplace_settlement", row.id, { journalId });
      return { item: row };
    });
  }),

  /* ───────────── Ruang pribadi (RLS pemilik) ───────────── */
  r("GET", "/v6/personal/accounts", { perm: "personal:read", ownerSpace: true }, async ({ ctx, tx }) => {
    const accounts = await tx.select().from(personalAccounts)
      .where(eq(personalAccounts.ownerId, ctx.ownerId!)).orderBy(desc(personalAccounts.createdAt));
    const txs = await tx.select().from(personalTransactions).where(eq(personalTransactions.ownerId, ctx.ownerId!));
    const balances = new Map<string, bigint>();
    for (const a of accounts) balances.set(a.id, toCents(a.openingBalance));
    for (const t of txs) {
      const amt = toCents(t.amount);
      if (t.type === "income") balances.set(t.accountId, (balances.get(t.accountId) ?? 0n) + amt);
      else if (t.type === "expense") balances.set(t.accountId, (balances.get(t.accountId) ?? 0n) - amt);
      else if (t.type === "transfer") {
        balances.set(t.accountId, (balances.get(t.accountId) ?? 0n) - amt);
        if (t.toAccountId) balances.set(t.toAccountId, (balances.get(t.toAccountId) ?? 0n) + amt);
      }
    }
    return { items: accounts.map((a) => ({ ...a, balance: fromCents(balances.get(a.id) ?? 0n) })) };
  }),

  r("POST", "/v6/personal/accounts", { perm: "personal:write", ownerSpace: true }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({
      name: z.string().trim().min(1).max(60),
      // R1: tidak ada jenis akun dompet/e-wallet — hanya catatan tunai, bank, atau lainnya.
      kind: z.enum(["cash", "bank", "other"]).default("cash"),
      openingBalance: optMoney,
      currency: z.string().regex(/^[A-Z]{3}$/).default("IDR"),
    }));
    const [row] = await tx.insert(personalAccounts).values({
      ownerId: ctx.ownerId!, name: b.name, kind: b.kind, openingBalance: b.openingBalance ?? "0", currency: b.currency,
    }).returning();
    await audit(tx, ctx, "create", "personal_account", row.id);
    return { item: row };
  }),

  r("GET", "/v6/personal/transactions", { perm: "personal:read", ownerSpace: true }, async ({ ctx, query, tx }) => {
    const from = query.get("from") || null;
    const to = query.get("to") || null;
    const limit = Math.min(Number(query.get("limit") ?? 200) || 200, 500);
    const res = await tx.execute(sql`
      select t.id, t.account_id as "accountId", a.name as "accountName", t.to_account_id as "toAccountId",
        t.type, t.amount::text as amount, t.category, t.occurred_on::text as "occurredOn", t.note, t.created_at as "createdAt"
      from personal_transactions t join personal_accounts a on a.id = t.account_id
      where t.owner_id = ${ctx.ownerId!}
        and (${from}::date is null or t.occurred_on >= ${from}::date)
        and (${to}::date is null or t.occurred_on <= ${to}::date)
      order by t.occurred_on desc, t.created_at desc limit ${limit}`);
    return { items: res.rows };
  }),

  r("POST", "/v6/personal/transactions", { perm: "personal:write", ownerSpace: true }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      accountId: uuid,
      toAccountId: uuid.optional().nullable(),
      type: z.enum(["income", "expense", "transfer"]),
      amount: moneyStr,
      category: z.string().trim().max(60).optional().nullable(),
      occurredOn: dateStr,
      note: z.string().trim().max(500).optional().nullable(),
    }));
    if (toCents(b.amount) <= 0n) throw new HttpError(422, "Nominal harus lebih dari nol.", "bad_amount");
    const [own] = await tx.select({ id: personalAccounts.id }).from(personalAccounts)
      .where(and(eq(personalAccounts.id, b.accountId), eq(personalAccounts.ownerId, ctx.ownerId!)));
    if (!own) throw new HttpError(422, "Akun pribadi tidak ditemukan.", "bad_account");
    if (b.type === "transfer") {
      if (!b.toAccountId || b.toAccountId === b.accountId) throw new HttpError(422, "Akun tujuan transfer tidak valid.", "bad_transfer");
      const [to] = await tx.select({ id: personalAccounts.id }).from(personalAccounts)
        .where(and(eq(personalAccounts.id, b.toAccountId), eq(personalAccounts.ownerId, ctx.ownerId!)));
      if (!to) throw new HttpError(422, "Akun tujuan tidak ditemukan.", "bad_account");
    }
    return idempotent(tx as unknown as Tx, ctx, idemKey, async () => {
      const [row] = await tx.insert(personalTransactions).values({
        ownerId: ctx.ownerId!, accountId: b.accountId, toAccountId: b.type === "transfer" ? b.toAccountId ?? null : null,
        type: b.type, amount: b.amount, category: b.category ?? null, occurredOn: b.occurredOn, note: b.note ?? null,
      }).returning();
      await audit(tx, ctx, "create", "personal_transaction", row.id, { type: b.type });
      return { item: row };
    });
  }),

  r("GET", "/v6/personal/summary", { perm: "personal:read", ownerSpace: true }, async ({ ctx, query, tx }) => {
    const month = query.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(422, "Bulan tidak valid (YYYY-MM).");
    const accounts = await tx.select().from(personalAccounts).where(eq(personalAccounts.ownerId, ctx.ownerId!));
    const all = await tx.select().from(personalTransactions).where(eq(personalTransactions.ownerId, ctx.ownerId!));
    const budgets = await tx.select().from(personalBudgets).where(and(eq(personalBudgets.ownerId, ctx.ownerId!), eq(personalBudgets.month, month)));
    const goals = await tx.select().from(personalGoals).where(eq(personalGoals.ownerId, ctx.ownerId!));

    let balance = 0n;
    for (const a of accounts) balance += toCents(a.openingBalance);
    let income = 0n;
    let expense = 0n;
    const spentByCategory = new Map<string, bigint>();
    for (const t of all) {
      const amt = toCents(t.amount);
      if (t.type === "income") { balance += amt; if (t.occurredOn.startsWith(month)) income += amt; }
      else if (t.type === "expense") {
        balance -= amt;
        if (t.occurredOn.startsWith(month)) {
          expense += amt;
          const key = t.category ?? "lainnya";
          spentByCategory.set(key, (spentByCategory.get(key) ?? 0n) + amt);
        }
      }
    }
    return {
      month,
      balance: fromCents(balance),
      income: fromCents(income),
      expense: fromCents(expense),
      net: fromCents(income - expense),
      budgets: budgets.map((b) => ({
        ...b,
        spent: fromCents(spentByCategory.get(b.category) ?? 0n),
        usage: pct(spentByCategory.get(b.category) ?? 0n, toCents(b.amount)),
      })),
      goals,
    };
  }),

  r("GET", "/v6/personal/budgets", { perm: "personal:read", ownerSpace: true }, async ({ ctx, query, tx }) => {
    const month = query.get("month") || null;
    const rows = await tx.select().from(personalBudgets)
      .where(and(eq(personalBudgets.ownerId, ctx.ownerId!), month ? eq(personalBudgets.month, month) : sql`true`))
      .orderBy(desc(personalBudgets.month));
    return { items: rows };
  }),

  r("POST", "/v6/personal/budgets", { perm: "personal:write", ownerSpace: true }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Bulan tidak valid"),
      category: z.string().trim().min(1).max(60),
      amount: moneyStr,
    }));
    const [row] = await tx.insert(personalBudgets).values({ ownerId: ctx.ownerId!, month: b.month, category: b.category, amount: b.amount })
      .onConflictDoUpdate({
        target: [personalBudgets.ownerId, personalBudgets.month, personalBudgets.category],
        set: { amount: b.amount },
      }).returning();
    return { item: row };
  }),

  r("GET", "/v6/personal/goals", { perm: "personal:read", ownerSpace: true }, async ({ ctx, tx }) => {
    const rows = await tx.select().from(personalGoals).where(eq(personalGoals.ownerId, ctx.ownerId!)).orderBy(desc(personalGoals.createdAt));
    return { items: rows };
  }),

  r("POST", "/v6/personal/goals", { perm: "personal:write", ownerSpace: true }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({
      name: z.string().trim().min(1).max(80),
      targetAmount: moneyStr,
      savedAmount: optMoney,
      targetDate: dateStr.optional().nullable(),
    }));
    if (toCents(b.targetAmount) <= 0n) throw new HttpError(422, "Target harus lebih dari nol.");
    const [row] = await tx.insert(personalGoals).values({
      ownerId: ctx.ownerId!, name: b.name, targetAmount: b.targetAmount, savedAmount: b.savedAmount ?? "0", targetDate: b.targetDate ?? null,
    }).returning();
    return { item: row };
  }),

  r("POST", "/v6/personal/goals/:id/contribute", { perm: "personal:write", ownerSpace: true }, async ({ ctx, params, json, tx }) => {
    const b = await json(z.object({ amount: moneyStr }));
    const [goal] = await tx.select().from(personalGoals)
      .where(and(eq(personalGoals.id, params.id), eq(personalGoals.ownerId, ctx.ownerId!)));
    if (!goal) throw new HttpError(404, "Tujuan tidak ditemukan", "not_found");
    const saved = toCents(goal.savedAmount) + toCents(b.amount);
    if (saved < 0n) throw new HttpError(422, "Kontribusi melebihi sisa target.", "bad_amount");
    const [row] = await tx.update(personalGoals)
      .set({ savedAmount: fromCents(saved), status: saved >= toCents(goal.targetAmount) ? "achieved" : goal.status })
      .where(eq(personalGoals.id, goal.id)).returning();
    return { item: row };
  }),

  /* ───────────── Jembatan pemilik ↔ bisnis ───────────── */
  r("GET", "/v6/bridge/mappings", { perm: "bridge:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      select m.id, m.label, m.direction, m.personal_category as "personalCategory", m.cash_account_id as "cashAccountId",
        a.name as "cashAccountName", m.coa_account_id as "coaAccountId", co.code as "coaCode", co.name as "coaName",
        m.is_active as "isActive"
      from bridge_mappings m join cash_accounts a on a.id = m.cash_account_id join coa_accounts co on co.id = m.coa_account_id
      where m.workspace_id = ${ctx.workspaceId} and m.owner_id = ${ctx.ownerId!} order by m.created_at desc`);
    return { items: res.rows };
  }),

  r("POST", "/v6/bridge/mappings", { perm: "bridge:write" }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({
      label: z.string().trim().min(1).max(60),
      direction: z.enum(["personal_to_business", "business_to_owner"]),
      personalCategory: z.string().trim().max(60).optional().nullable(),
      cashAccountId: uuid,
      coaAccountId: uuid,
    }));
    const [acc] = await tx.select({ id: cashAccounts.id }).from(cashAccounts)
      .where(and(eq(cashAccounts.id, b.cashAccountId), eq(cashAccounts.workspaceId, ctx.workspaceId)));
    if (!acc) throw new HttpError(422, "Akun kas/bank tidak ditemukan.", "bad_account");
    const [coa] = await tx.select({ id: coaAccounts.id, isActive: coaAccounts.isActive }).from(coaAccounts)
      .where(and(eq(coaAccounts.id, b.coaAccountId), eq(coaAccounts.workspaceId, ctx.workspaceId)));
    if (!coa || !coa.isActive) throw new HttpError(422, "Akun bagan akun tidak ditemukan/nonaktif.", "bad_coa");
    const [row] = await tx.insert(bridgeMappings).values({
      workspaceId: ctx.workspaceId, businessId: ctx.businessId, ownerId: ctx.ownerId!,
      label: b.label, direction: b.direction, personalCategory: b.personalCategory ?? null,
      cashAccountId: b.cashAccountId, coaAccountId: b.coaAccountId,
    }).returning();
    await audit(tx, ctx, "create", "bridge_mapping", row.id);
    return { item: row };
  }),

  r("GET", "/v6/bridge/postings", { perm: "bridge:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      select p.id, p.mapping_id as "mappingId", m.label, m.direction, p.amount::text as amount,
        p.posted_on::text as "postedOn", p.personal_transaction_id as "personalTransactionId",
        p.finance_transaction_id as "financeTransactionId", p.note, p.created_at as "createdAt"
      from bridge_postings p join bridge_mappings m on m.id = p.mapping_id
      where p.workspace_id = ${ctx.workspaceId} and p.owner_id = ${ctx.ownerId!} order by p.posted_on desc limit 200`);
    return { items: res.rows };
  }),

  r("POST", "/v6/bridge/post", { perm: "bridge:write", ownerSpace: true }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      mappingId: uuid,
      amount: moneyStr,
      postedOn: dateStr,
      personalTransactionId: uuid.optional().nullable(),
      note: z.string().trim().max(500).optional().nullable(),
    }));
    if (toCents(b.amount) <= 0n) throw new HttpError(422, "Nominal harus lebih dari nol.");
    const [m] = await tx.select().from(bridgeMappings)
      .where(and(eq(bridgeMappings.id, b.mappingId), eq(bridgeMappings.workspaceId, ctx.workspaceId), eq(bridgeMappings.ownerId, ctx.ownerId!)));
    if (!m || !m.isActive) throw new HttpError(422, "Pemetaan jembatan tidak ditemukan/nonaktif.", "bad_mapping");
    if (b.personalTransactionId) {
      const [pt] = await tx.select({ id: personalTransactions.id }).from(personalTransactions)
        .where(and(eq(personalTransactions.id, b.personalTransactionId), eq(personalTransactions.ownerId, ctx.ownerId!)));
      if (!pt) throw new HttpError(422, "Transaksi pribadi tidak ditemukan.", "bad_personal_tx");
    }
    return idempotent(tx as unknown as Tx, ctx, idemKey, async () => {
      const [cash] = await tx.select().from(cashAccounts)
        .where(and(eq(cashAccounts.id, m.cashAccountId), eq(cashAccounts.workspaceId, ctx.workspaceId)));
      if (!cash) throw new HttpError(422, "Akun kas pada pemetaan tidak ditemukan.", "bad_account");
      const lines: Array<{ accountId: string; debit?: string; credit?: string }> = m.direction === "personal_to_business"
        ? [{ accountId: cash.coaAccountId, debit: b.amount }, { accountId: m.coaAccountId, credit: b.amount }]
        : [{ accountId: m.coaAccountId, debit: b.amount }, { accountId: cash.coaAccountId, credit: b.amount }];
      const journalId = await postJournal(tx as unknown as Tx, ctx, {
        date: b.postedOn,
        memo: `Jembatan pemilik: ${m.label}`,
        source: "owner_bridge",
        lines,
      });
      const [row] = await tx.insert(bridgePostings).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, ownerId: ctx.ownerId!,
        mappingId: m.id, personalTransactionId: b.personalTransactionId ?? null,
        amount: b.amount, postedOn: b.postedOn, note: b.note ?? null,
      }).returning();
      await audit(tx, ctx, "create", "bridge_posting", row.id, { journalId });
      return { item: row, journalId };
    });
  }),

  /* ───────────── Prakiraan kas ───────────── */
  r("GET", "/v6/forecast", { perm: "forecast:read" }, async ({ ctx, query, tx }) => {
    // R11-E: horizon bawaan berasal dari Pusat Aturan workspace (bukan angka tetap di kode).
    const rules = await getWorkspaceRules(tx, ctx);
    const weeks = Math.max(
      1,
      Math.min(52, Number(query.get("weeks") ?? rules.forecastDefaultWeeks) || rules.forecastDefaultWeeks),
    );
    const biz = await getBusiness(tx, ctx);
    const today = todayIn(biz.timezone);

    const cashRes = await tx.execute(sql`
      select coalesce(sum(l.debit - l.credit), 0)::text as balance
      from journal_lines l join coa_accounts a on a.id = l.account_id
      where l.workspace_id = ${ctx.workspaceId} and a.subtype in ('cash','bank')`);
    const opening = (cashRes.rows[0] as { balance: string } | undefined)?.balance ?? "0";

    const invRes = await tx.execute(sql`
      select total::text as total, paid::text as paid, coalesce(due_date, issued_at::date + 7)::text as "dueDate", number
      from invoices where workspace_id = ${ctx.workspaceId} and status in ('unpaid','partial') and (total - paid) > 0
      order by due_date nulls last limit 500`);
    const billRes = await tx.execute(sql`
      select total::text as total, paid::text as paid, (created_at::date + 14)::text as "dueDate", number
      from supplier_bills where workspace_id = ${ctx.workspaceId} and status in ('unpaid','partial') and (total - paid) > 0
      order by created_at limit 500`);

    const inflows = (invRes.rows as Array<{ total: string; paid: string; dueDate: string; number: string }>).map((r) => ({
      date: r.dueDate, amount: fromCents(toCents(r.total) - toCents(r.paid)), label: `Faktur ${r.number}`,
    }));
    const outflows = (billRes.rows as Array<{ total: string; paid: string; dueDate: string; number: string }>).map((r) => ({
      date: r.dueDate, amount: fromCents(toCents(r.total) - toCents(r.paid)), label: `Tagihan ${r.number}`,
    }));

    const expRes = await tx.execute(sql`
      select coalesce(sum(l.debit - l.credit),0)::text as total
      from journal_lines l join coa_accounts a on a.id = l.account_id
      join journal_entries e on e.id = l.entry_id
      where l.workspace_id = ${ctx.workspaceId} and a.type = 'expense'
        and e.entry_date >= (current_date - interval '56 days')`);
    const expenseTotal = (expRes.rows[0] as { total: string } | undefined)?.total ?? "0";
    const dailyOperating = fromCents(toCents(expenseTotal) / 56n);

    const result = buildForecast({
      openingBalance: opening,
      inflows,
      outflows,
      dailyOperatingExpense: dailyOperating,
      weeks,
      startDate: today,
      evidenceCount: inflows.length + outflows.length,
    });
    return {
      ...result,
      generatedAt: new Date().toISOString(),
      openingBalance: opening,
      dailyOperatingExpense: dailyOperating,
      sources: { unpaidInvoices: inflows.length, unpaidBills: outflows.length, expenseWindowDays: 56 },
      health: cashHealth(result.minClosing, weeks),
    };
  }),

  /* ───────────── BI ───────────── */
  r("GET", "/v6/bi", { perm: "bi:read" }, async ({ ctx, query, tx }) => {
    const from = query.get("from") || null;
    const to = query.get("to") || null;
    const range = sql`(${from}::date is null or e.entry_date >= ${from}::date) and (${to}::date is null or e.entry_date <= ${to}::date)`;

    const pl = await tx.execute(sql`
      select a.type, a.subtype, coalesce(sum(l.debit),0)::text as debit, coalesce(sum(l.credit),0)::text as credit
      from journal_lines l join coa_accounts a on a.id = l.account_id join journal_entries e on e.id = l.entry_id
      where l.workspace_id = ${ctx.workspaceId} and ${range}
      group by a.type, a.subtype`);
    let revenue = 0n; let cogs = 0n; let expense = 0n;
    for (const r of pl.rows as Array<{ type: string; subtype: string | null; debit: string; credit: string }>) {
      if (r.type === "revenue") revenue += toCents(r.credit) - toCents(r.debit);
      else if (r.type === "expense") {
        const v = toCents(r.debit) - toCents(r.credit);
        if (r.subtype === "cogs") cogs += v; else expense += v;
      }
    }
    // Calculation Engine: satu sumber rumus, pembagi nol → N/A (bukan 0).
    const net = netSales({ gross: revenue });
    const gross = grossProfit(net, cogs);
    const net_ = netProfit({ grossProfit: gross, operatingExpense: expense, classificationComplete: true });
    const grossMarginBp = marginBp(gross, net);
    const netMarginBp = marginBp(net_, net);

    const cashRes = await tx.execute(sql`
      select coalesce(sum(l.debit - l.credit),0)::text as balance
      from journal_lines l join coa_accounts a on a.id = l.account_id
      where l.workspace_id = ${ctx.workspaceId} and a.subtype in ('cash','bank')`);
    const cashBalance = (cashRes.rows[0] as { balance: string } | undefined)?.balance ?? "0";

    const arRes = await tx.execute(sql`
      select coalesce(sum(total - paid),0)::text as v, count(*)::int as n, coalesce(avg(total),0)::text as avg
      from invoices where workspace_id = ${ctx.workspaceId} and status in ('unpaid','partial')`);
    const apRes = await tx.execute(sql`
      select coalesce(sum(total - paid),0)::text as v, count(*)::int as n
      from supplier_bills where workspace_id = ${ctx.workspaceId} and status in ('unpaid','partial')`);

    const topProducts = await tx.execute(sql`
      select p.name, p.sku, coalesce(sum(il.line_total),0)::text as revenue, coalesce(sum(il.quantity),0)::text as qty
      from invoice_lines il join products p on p.id = il.product_id
      join invoices i on i.id = il.invoice_id
      where il.workspace_id = ${ctx.workspaceId} and i.status <> 'reversed'
        and (${from}::date is null or i.issued_at::date >= ${from}::date)
        and (${to}::date is null or i.issued_at::date <= ${to}::date)
      group by p.id, p.name, p.sku order by sum(il.line_total) desc limit 5`);

    const topClients = await tx.execute(sql`
      select coalesce(c.name, 'Pelanggan umum') as name, coalesce(sum(i.total),0)::text as revenue, count(i.id)::int as "invoiceCount"
      from invoices i left join clients c on c.id = i.client_id
      where i.workspace_id = ${ctx.workspaceId} and i.status <> 'reversed'
        and (${from}::date is null or i.issued_at::date >= ${from}::date)
        and (${to}::date is null or i.issued_at::date <= ${to}::date)
      group by c.id, c.name order by sum(i.total) desc limit 5`);

    const trend = await tx.execute(sql`
      select to_char(date_trunc('month', e.entry_date), 'YYYY-MM') as month,
        coalesce(sum(case when a.type = 'revenue' then l.credit - l.debit else 0 end),0)::text as revenue,
        coalesce(sum(case when a.type = 'expense' then l.debit - l.credit else 0 end),0)::text as expense
      from journal_entries e join journal_lines l on l.entry_id = e.id join coa_accounts a on a.id = l.account_id
      where e.workspace_id = ${ctx.workspaceId} and e.entry_date >= (current_date - interval '6 months')
      group by 1 order by 1`);

    return {
      range: { from, to },
      profitLoss: {
        revenue: fromCents(revenue), cogs: fromCents(cogs), grossProfit: fromCents(gross.cents ?? 0n),
        expense: fromCents(expense), netProfit: fromCents(net_.cents ?? 0n),
        // null = N/A dengan alasan; tidak pernah dipalsukan menjadi 0.
        grossMargin: grossMarginBp.cents === null ? null : Number(grossMarginBp.cents) / 100,
        netMargin: netMarginBp.cents === null ? null : Number(netMarginBp.cents) / 100,
        marginReason: grossMarginBp.reason ?? netMarginBp.reason ?? null,
      },
      cashBalance,
      receivables: { value: (arRes.rows[0] as { v: string }).v, count: (arRes.rows[0] as { n: number }).n, average: (arRes.rows[0] as { avg: string }).avg },
      payables: { value: (apRes.rows[0] as { v: string }).v, count: (apRes.rows[0] as { n: number }).n },
      topProducts: topProducts.rows,
      topClients: topClients.rows,
      trend: trend.rows,
    };
  }),

  /* ───────────── Etalase ───────────── */
  r("GET", "/v6/storefront", { perm: "storefront:read" }, async ({ ctx, tx }) => {
    const [row] = await tx.select().from(storefronts).where(eq(storefronts.workspaceId, ctx.workspaceId));
    // Etalase adalah KATALOG INFORMASI baca-saja: tidak ada kotak masuk permintaan pembeli
    // (revisi F-08 pada prompt R7-C §1).
    return { item: row ?? null, publicPath: row ? `/s/${row.slug}` : null };
  }),

  r("PATCH", "/v6/storefront", { perm: "storefront:write" }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,49}$/, "Slug 3–50 karakter: huruf kecil, angka, tanda hubung").optional(),
      title: z.string().trim().min(1).max(80).optional(),
      tagline: z.string().trim().max(160).optional().nullable(),
      about: z.string().trim().max(2000).optional().nullable(),
      contactPhone: z.string().trim().max(40).optional().nullable(),
      isPublished: z.boolean().optional(),
    }));
    const [existing] = await tx.select().from(storefronts).where(eq(storefronts.workspaceId, ctx.workspaceId));
    if (existing) {
      const [row] = await tx.update(storefronts).set({ ...b, updatedAt: new Date() }).where(eq(storefronts.id, existing.id)).returning();
      await audit(tx, ctx, "update", "storefront", row.id, { published: row.isPublished });
      return { item: row };
    }
    if (!b.slug || !b.title) throw new HttpError(422, "Slug dan judul wajib diisi saat pertama kali.", "validation");
    const [row] = await tx.insert(storefronts).values({
      workspaceId: ctx.workspaceId, businessId: ctx.businessId, slug: b.slug, title: b.title,
      tagline: b.tagline ?? null, about: b.about ?? null, contactPhone: b.contactPhone ?? null, isPublished: b.isPublished ?? false,
    }).returning();
    await audit(tx, ctx, "create", "storefront", row.id);
    return { item: row };
  }),

  /* ───────────── RFQ ───────────── */
  r("GET", "/v6/rfq", { perm: "rfq:read" }, async ({ ctx, query, tx }) => {
    const status = query.get("status") || null;
    const res = await tx.execute(sql`
      select q.id, q.number, q.title, q.due_date::text as "dueDate", q.status, q.client_id as "clientId", c.name as "clientName",
        (select count(*)::int from rfq_quotes qq where qq.rfq_id = q.id) as "quoteCount",
        (select max(qq.amount)::text from rfq_quotes qq where qq.rfq_id = q.id) as "bestAmount",
        q.created_at as "createdAt"
      from rfq_requests q left join clients c on c.id = q.client_id
      where q.workspace_id = ${ctx.workspaceId} and (${status}::text is null or q.status = ${status})
      order by q.created_at desc limit 200`);
    return { items: res.rows };
  }),

  r("POST", "/v6/rfq", { perm: "rfq:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      clientId: uuid.optional().nullable(),
      title: z.string().trim().min(1).max(120),
      details: z.string().trim().max(2000).optional().nullable(),
      dueDate: dateStr.optional().nullable(),
    }));
    return idempotent(tx as unknown as Tx, ctx, idemKey, async () => {
      const number = await nextNumber(tx, ctx.workspaceId, "rfq", "RFQ");
      const [row] = await tx.insert(rfqRequests).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, number,
        clientId: b.clientId ?? null, title: b.title, details: b.details ?? null, dueDate: b.dueDate ?? null,
      }).returning();
      await audit(tx, ctx, "create", "rfq", row.id);
      return { item: row };
    });
  }),

  r("GET", "/v6/rfq/:id", { perm: "rfq:read" }, async ({ ctx, params, tx }) => {
    const [req] = await tx.select().from(rfqRequests)
      .where(and(eq(rfqRequests.id, params.id), eq(rfqRequests.workspaceId, ctx.workspaceId)));
    if (!req) throw new HttpError(404, "RFQ tidak ditemukan", "not_found");
    const quotes = await tx.select().from(rfqQuotes).where(eq(rfqQuotes.rfqId, req.id)).orderBy(desc(rfqQuotes.createdAt));
    return { item: req, quotes };
  }),

  r("POST", "/v6/rfq/:id/quotes", { perm: "rfq:write" }, async ({ ctx, params, json, idemKey, tx }) => {
    const b = await json(z.object({
      amount: moneyStr,
      validUntil: dateStr.optional().nullable(),
      note: z.string().trim().max(1000).optional().nullable(),
    }));
    if (toCents(b.amount) <= 0n) throw new HttpError(422, "Nilai kutipan harus lebih dari nol.");
    const [req] = await tx.select().from(rfqRequests)
      .where(and(eq(rfqRequests.id, params.id), eq(rfqRequests.workspaceId, ctx.workspaceId)));
    if (!req) throw new HttpError(404, "RFQ tidak ditemukan", "not_found");
    if (["accepted", "closed", "cancelled"].includes(req.status)) throw new HttpError(409, "RFQ sudah ditutup.", "bad_transition");
    return idempotent(tx as unknown as Tx, ctx, idemKey, async () => {
      const [row] = await tx.insert(rfqQuotes).values({
        workspaceId: ctx.workspaceId, businessId: ctx.businessId, rfqId: req.id, amount: b.amount,
        validUntil: b.validUntil ?? null, note: b.note ?? null,
      }).returning();
      if (req.status === "open") await tx.update(rfqRequests).set({ status: "quoted" }).where(eq(rfqRequests.id, req.id));
      await audit(tx, ctx, "create", "rfq_quote", row.id);
      return { item: row };
    });
  }),

  r("POST", "/v6/rfq/quotes/:id/decide", { perm: "rfq:write" }, async ({ ctx, params, json, tx }) => {
    const b = await json(z.object({ decision: z.enum(["accepted", "rejected"]) }));
    const [quote] = await tx.select().from(rfqQuotes)
      .where(and(eq(rfqQuotes.id, params.id), eq(rfqQuotes.workspaceId, ctx.workspaceId)));
    if (!quote) throw new HttpError(404, "Kutipan tidak ditemukan", "not_found");
    const [req] = await tx.select().from(rfqRequests).where(eq(rfqRequests.id, quote.rfqId));
    if (!req) throw new HttpError(404, "RFQ tidak ditemukan", "not_found");
    if (b.decision === "accepted") {
      await tx.update(rfqQuotes).set({ status: "rejected" }).where(and(eq(rfqQuotes.rfqId, req.id), eq(rfqQuotes.status, "sent")));
      await tx.update(rfqQuotes).set({ status: "accepted" }).where(eq(rfqQuotes.id, quote.id));
      await tx.update(rfqRequests).set({ status: "accepted" }).where(eq(rfqRequests.id, req.id));
    } else {
      await tx.update(rfqQuotes).set({ status: "rejected" }).where(eq(rfqQuotes.id, quote.id));
    }
    await audit(tx, ctx, `rfq.${b.decision}`, "rfq_quote", quote.id);
    return { ok: true };
  }),

  r("POST", "/v6/rfq/:id/close", { perm: "rfq:write" }, async ({ ctx, params, tx }) => {
    const [row] = await tx.update(rfqRequests).set({ status: "closed" })
      .where(and(eq(rfqRequests.id, params.id), eq(rfqRequests.workspaceId, ctx.workspaceId))).returning();
    if (!row) throw new HttpError(404, "RFQ tidak ditemukan", "not_found");
    await audit(tx, ctx, "rfq.close", "rfq", row.id);
    return { item: row };
  }),

  /* ───────────── Pembelajaran ───────────── */
  r("GET", "/v6/learning", { perm: "learning:read" }, async ({ ctx, tx }) => {
    const rows = await tx.select().from(learningProgress)
      .where(and(eq(learningProgress.workspaceId, ctx.workspaceId), eq(learningProgress.userRef, ctx.ownerId!)));
    return { items: rows, lessons: LESSONS };
  }),

  r("POST", "/v6/learning/:key", { perm: "learning:write" }, async ({ ctx, params, json, tx }) => {
    const b = await json(z.object({ status: z.enum(["started", "completed"]), score: z.number().int().min(0).max(100).optional() }));
    if (!LESSONS.some((l) => l.key === params.key)) throw new HttpError(404, "Materi tidak ditemukan", "not_found");
    const [row] = await tx.insert(learningProgress).values({
      workspaceId: ctx.workspaceId, businessId: ctx.businessId, userRef: ctx.ownerId!,
      lessonKey: params.key, status: b.status, score: b.score ?? null, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [learningProgress.workspaceId, learningProgress.userRef, learningProgress.lessonKey],
      set: { status: b.status, score: b.score ?? null, updatedAt: new Date() },
    }).returning();
    return { item: row };
  }),

  /* ───────────── Preferensi bahasa ───────────── */
  /* ───────────── Etalase publik (tanpa sesi) ───────────── */
  r("GET", "/public/storefront/:slug", { auth: "none" }, async ({ params, tx }) => {
    const slug = params.slug.toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(slug)) throw new HttpError(404, "Etalase tidak ditemukan", "not_found");
    const res = await tx.execute(sql`
      select s.id, s.slug, s.title, s.tagline, s.about, s.contact_phone as "contactPhone", s.workspace_id as "workspaceId",
        b.name as "businessName", b.currency, b.timezone
      from storefronts s join businesses b on b.id = s.business_id
      where lower(s.slug) = ${slug} and s.is_published = true limit 1`);
    const row = res.rows[0] as { id: string; slug: string; title: string; tagline: string | null; about: string | null; contactPhone: string | null; workspaceId: string; businessName: string; currency: string; timezone: string } | undefined;
    if (!row) throw new HttpError(404, "Etalase tidak ditemukan atau belum diterbitkan.", "not_found");
    const prods = await tx.execute(sql`
      select p.id, p.name, p.category, p.unit, p.price::text as price
      from products p where p.workspace_id = ${row.workspaceId} and p.is_active = true
      order by p.name limit 60`);
    return {
      item: { slug: row.slug, title: row.title, tagline: row.tagline, about: row.about, contactPhone: row.contactPhone, businessName: row.businessName, currency: row.currency, timezone: row.timezone },
      products: prods.rows,
    };
  }),

  r("PATCH", "/v6/preferences", {}, async ({ ctx, json, tx }) => {
    const b = await json(z.object({ language: z.enum(["id", "en"]) }));
    await tx.update(businesses).set({ language: b.language }).where(eq(businesses.id, ctx.businessId));
    await audit(tx, ctx, "update", "preferences", ctx.businessId, { language: b.language });
    return { ok: true, language: b.language };
  }),

  /* ───────────── Impor generik (R11-A): peta, profiles, pratinjau, commit ───────────── */
  r("GET", "/v6/imports/recording/catalog", { perm: "import:read" }, async () => ({
    reportTypes: REPORT_CATALOG,
    providers: PROVIDER_CONTEXTS,
    writable: [...WRITABLE_REPORT_TYPES],
    maxRows: MAX_ROWS,
    extensions: [...SUPPORTED_EXTENSIONS],
    // Tidak ada adapter native dan tidak ada daftar header provider (prompt §M-14).
    note: "Provider hanyalah konteks sumber yang Anda pilih; pemetaan kolom selalu manual.",
  })),

  r("POST", "/v6/imports/recording/inspect", { perm: "import:write", maxBodyBytes: 4_194_304 }, async ({ json }) => {
    const b = await json(z.object({
      filename: z.string().trim().min(1).max(200),
      text: z.string().max(4_000_000).optional(),
      base64: z.string().max(6_000_000).optional(),
    }));
    return inspectUpload(b);
  }),

  r("GET", "/v6/imports/recording/profiles", { perm: "import:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      select p.id, p.name, p.domain, p.report_type as "reportType", p.provider_code as "providerCode",
        p.source_label as "sourceLabel", p.file_format as "fileFormat", p.status, p.current_version as "currentVersion",
        p.updated_at as "updatedAt",
        v.sheet_name as "sheetName", v.header_row as "headerRow", v.mapping, v.parsing
      from import_mapping_profiles p
      left join import_mapping_profile_versions v
        on v.workspace_id = p.workspace_id and v.profile_id = p.id and v.version = p.current_version
      where p.workspace_id = ${ctx.workspaceId}
      order by p.updated_at desc limit 200`);
    return { items: res.rows };
  }),

  r("POST", "/v6/imports/recording/profiles", { perm: "import:write" }, async ({ ctx, json, tx }) => {
    const b = await json(profileInput);
    const report = reportType(b.reportType);
    if (!report) throw new HttpError(422, "Jenis laporan impor tidak dikenal.", "bad_report_type");
    const [profile] = (
      await tx.execute(sql`
        insert into import_mapping_profiles
          (workspace_id, name, domain, report_type, provider_code, source_label, file_format, status, current_version, created_by)
        values (${ctx.workspaceId}, ${b.name}, ${report.domain}, ${report.key}, ${b.providerCode ?? null}, ${b.sourceLabel ?? null},
          ${b.fileFormat}, 'USER_CONFIRMED', 1, ${ctx.ownerId ?? null}) returning id`)
    ).rows as Array<{ id: string }>;
    await tx.execute(sql`
      insert into import_mapping_profile_versions
        (workspace_id, profile_id, version, sheet_name, header_row, mapping, parsing, created_by)
      values (${ctx.workspaceId}, ${profile.id}, 1, ${b.snapshot.sheetName}, ${b.snapshot.headerRow},
        ${JSON.stringify(b.snapshot.mapping)}::jsonb, ${JSON.stringify(b.snapshot.parsing)}::jsonb, ${ctx.ownerId ?? null})`);
    await audit(tx, ctx, "import.profile.create", "import_mapping_profile", profile.id, { reportType: report.key, version: 1 });
    return { id: profile.id, version: 1, status: "USER_CONFIRMED" };
  }),

  r("POST", "/v6/imports/recording/profiles/:id/versions", { perm: "import:write" }, async ({ ctx, params, json, tx }) => {
    const b = await json(profileInput.pick({ snapshot: true }));
    const head = await tx.execute(sql`
      select p.id, p.current_version as "currentVersion", p.report_type as "reportType"
      from import_mapping_profiles p where p.workspace_id = ${ctx.workspaceId} and p.id = ${params.id} limit 1`);
    const row = head.rows[0] as { id: string; currentVersion: number; reportType: string } | undefined;
    if (!row) throw new HttpError(404, "Profil pemetaan tidak ditemukan.", "not_found");
    const next = row.currentVersion + 1;
    await tx.execute(sql`
      insert into import_mapping_profile_versions
        (workspace_id, profile_id, version, sheet_name, header_row, mapping, parsing, created_by)
      values (${ctx.workspaceId}, ${row.id}, ${next}, ${b.snapshot.sheetName}, ${b.snapshot.headerRow},
        ${JSON.stringify(b.snapshot.mapping)}::jsonb, ${JSON.stringify(b.snapshot.parsing)}::jsonb, ${ctx.ownerId ?? null})`);
    await tx.execute(sql`
      update import_mapping_profiles set current_version = ${next}, status = 'USER_CONFIRMED', updated_at = now()
      where workspace_id = ${ctx.workspaceId} and id = ${row.id}`);
    await audit(tx, ctx, "import.profile.version", "import_mapping_profile", row.id, { version: next });
    return { id: row.id, version: next, status: "USER_CONFIRMED" };
  }),

  r("PATCH", "/v6/imports/recording/profiles/:id", { perm: "import:write" }, async ({ ctx, params, json, tx }) => {
    const b = await json(z.object({ status: z.enum(["USER_CONFIRMED", "DISABLED", "NEEDS_UPDATE", "DRAFT"]) }));
    const res = await tx.execute(sql`
      update import_mapping_profiles set status = ${b.status}, updated_at = now()
      where workspace_id = ${ctx.workspaceId} and id = ${params.id} returning id`);
    if (res.rows.length === 0) throw new HttpError(404, "Profil pemetaan tidak ditemukan.", "not_found");
    await audit(tx, ctx, "import.profile.status", "import_mapping_profile", params.id, { status: b.status });
    return { ok: true, status: b.status };
  }),

  r("POST", "/v6/imports/recording/preview", { perm: "import:write", maxBodyBytes: 4_194_304 }, async ({ ctx, json, tx }) => {
    const b = await json(recordingInput);
    // Pratinjau TIDAK menulis apa pun (dry run); baris invalid tetap ditampilkan.
    return buildPreview(tx, ctx.workspaceId, b);
  }),

  r("POST", "/v6/imports/recording/commit", { perm: "import:write", maxBodyBytes: 4_194_304 }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(recordingInput);
    // Satu batch = satu transaksi; idempotensi lewat kunci permintaan + kunci alami baris.
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => commitRecording(inner, ctx, b)));
  }),

  /*
   * Job langkah-kecil (R15 §2.1): berkas besar tidak lagi ditahan di event loop.
   * Pratinjau & commit >ambang dijalankan sebagai job; UI memantau progres nyata.
   */
  r("POST", "/v6/imports/recording/jobs", { perm: "import:write", maxBodyBytes: 8_388_608 }, async ({ ctx, json, idemKey, tx }) => {
    let t = performance.now();
    const b = await json(recordingInput.extend({ kind: z.enum(["PREVIEW", "COMMIT"]) }));
    let ms = Math.round(performance.now() - t);
    if (ms > 150) console.warn(`[import-job-route] body ${ms} ms`);
    t = performance.now();
    const progress = await idempotent(tx as Tx, ctx, idemKey, () => enqueueImportJob(ctx, b));
    ms = Math.round(performance.now() - t);
    if (ms > 150) console.warn(`[import-job-route] enqueue ${ms} ms`);
    return new Response(JSON.stringify(progress), {
      status: 202,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }),

  r("GET", "/v6/imports/recording/jobs/:id", { perm: "import:read" }, async ({ ctx, params }) => {
    const job = await loadJob(ctx.workspaceId, params.id);
    if (!job) throw new HttpError(404, "Job impor tidak ditemukan.", "not_found");
    return toProgress(job);
  }),

  /*
   * Mode serverless-aman (R16 §2.1): memproses potongan berikutnya dalam SATU permintaan
   * (≤6 dtk). UI memanggil ini berulang, sehingga job selesai tanpa loop latar/cron/ENV.
   */
  r("POST", "/v6/imports/recording/jobs/:id/advance", { perm: "import:write" }, async ({ ctx, params }) => {
    const t = performance.now();
    const result = await advanceJob(ctx, params.id);
    const ms = Math.round(performance.now() - t);
    if (ms > 1_000) console.warn(`[import-job-route] advance ${ms} ms state=${result.state}`);
    // 200: ini pembacaan progres + kemajuan, bukan pembuatan sumber daya.
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }),

  r("POST", "/v6/imports/recording/jobs/:id/cancel", { perm: "import:write" }, async ({ ctx, params }) =>
    cancelJob(ctx, params.id)),

  r("POST", "/v6/imports/recording/jobs/:id/resume", { perm: "import:write" }, async ({ ctx, params }) =>
    resumeJob(ctx, params.id)),

  r("GET", "/v6/imports/recording/batches", { perm: "import:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      select b.id, b.template, b.filename, b.total_rows as "totalRows", b.imported_rows as "importedRows",
        b.error_rows as "errorRows", b.status, b.summary, b.created_at as "createdAt", b.reversed_at as "reversedAt",
        (select count(*)::int from import_rows r where r.batch_id = b.id and r.status = 'duplicate') as duplicates
      from import_batches b where b.workspace_id = ${ctx.workspaceId} and b.dry_run = false
      order by b.created_at desc limit 100`);
    return { items: res.rows };
  }),

  r("GET", "/v6/imports/recording/batches/:id/rows", { perm: "import:read" }, async ({ ctx, params, tx }) => {
    const res = await tx.execute(sql`
      select row_no as "rowNo", status, code, params, target_table as "targetTable", target_id as "targetId"
      from import_rows where workspace_id = ${ctx.workspaceId} and batch_id = ${params.id}
      order by row_no limit 500`);
    return { items: res.rows };
  }),

  /*
   * Usulan pencocokan pencairan tercatat ↔ baris bank. Mengembalikan USULAN
   * berskor (nominal sama, tanggal berdekatan, rujukan disebut di keterangan) dan
   * TIDAK menulis apa pun — pencocokan hanya tersimpan setelah pengguna mengonfirmasi.
   */
  r("POST", "/v6/imports/reconcile/suggest", { perm: "import:write" }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({ toleranceDays: z.number().int().min(0).max(30).default(5) }));
    const receipts = await tx.execute(sql`
      select r.id, r.external_payment_ref as "paymentRef", r.amount::text as amount, r.occurred_on::text as "occurredOn"
      from marketplace_cash_receipts r where r.workspace_id = ${ctx.workspaceId} and r.recorded_status = 'recorded' limit 500`);
    const lines = await tx.execute(sql`
      select l.id, l.posted_on::text as "postedOn", l.description, l.amount::text as amount
      from bank_statement_lines l where l.workspace_id = ${ctx.workspaceId} and l.amount is not null and l.amount > 0
        and l.published_at is not null limit 1000`);
    const suggestions: Array<{ receiptId: string; bankLineId: string; score: number; difference: string; reason: string }> = [];
    for (const rec of receipts.rows as Array<{ id: string; paymentRef: string | null; amount: string; occurredOn: string | null }>) {
      for (const line of lines.rows as Array<{ id: string; postedOn: string | null; description: string; amount: string }>) {
        const diff = toCents(rec.amount) - toCents(line.amount);
        const days = rec.occurredOn && line.postedOn ? Math.abs((Date.parse(rec.occurredOn) - Date.parse(line.postedOn)) / 86_400_000) : 99;
        const refHit = rec.paymentRef ? line.description.includes(rec.paymentRef) : false;
        let score = 0;
        if (diff === 0n) score += 50;
        if (days <= b.toleranceDays) score += 20;
        if (refHit) score += 30;
        if (score >= 50) {
          suggestions.push({
            receiptId: rec.id, bankLineId: line.id, score,
            difference: fromCents(diff),
            reason: refHit ? "rujukan pembayaran muncul di keterangan bank" : days <= b.toleranceDays ? "nominal sama, tanggal berdekatan" : "nominal sama, tanggal jauh",
          });
        }
      }
    }
    suggestions.sort((a, z) => z.score - a.score);
    return { items: suggestions.slice(0, 100), receipts: receipts.rows.length, lines: lines.rows.length, note: "Usulan saja: pencocokan tersimpan hanya setelah Anda mengonfirmasi." };
  }),

  /* ───────────── Preview impor (validasi server, tanpa menulis) ───────────── */
  r("POST", "/v6/imports/preview", { perm: "import:write", maxBodyBytes: 1_048_576 }, async ({ ctx, json, tx }) => {
    const b = await json(z.object({
      target: z.string().refine((v) => (IMPORT_TARGET_KEYS as string[]).includes(v), "Target impor tidak dikenal."),
      rows: z.array(z.record(z.string(), z.string())).min(1).max(2000),
    }));
    const seen = new Set<string>();
    const out: Array<{ rowNo: number; status: "valid" | "invalid" | "duplicate"; error?: string; data: Record<string, string> }> = [];
    const existing = await existingImportKeys(tx, ctx.workspaceId, b.target);
    b.rows.forEach((raw, i) => {
      const row = normalizeImportRow(raw);
      const rowNo = i + 2;
      const invalid = validateImportRow(b.target, row);
      if (invalid) return out.push({ rowNo, status: "invalid", error: invalid, data: row });
      const key = importRowKey(b.target, row);
      if (key && (existing.has(key) || seen.has(key))) {
        return out.push({ rowNo, status: "duplicate", error: `${key} sudah ada`, data: row });
      }
      if (key) seen.add(key);
      out.push({ rowNo, status: "valid", data: row });
    });
    const payload = {
      target: b.target,
      total: out.length,
      valid: out.filter((r) => r.status === "valid").length,
      invalid: out.filter((r) => r.status === "invalid").length,
      duplicates: out.filter((r) => r.status === "duplicate").length,
      rows: out.slice(0, 200),
    };
    // Pratinjau bersifat baca-saja: 200, bukan 201 (tidak ada sumber daya dibuat).
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }),

  /* ───────────── R11-B/T3: alias rekening bank ───────────── */
  r("GET", "/v6/bank/aliases", { perm: "import:read" }, async ({ ctx, tx }) => listBankAliases(tx, ctx)),

  r("POST", "/v6/bank/aliases", { perm: "import:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      label: z.string().trim().min(1).max(80),
      bankLabel: z.string().trim().max(60).optional().nullable(),
      accountLast4: z.string().trim().regex(/^[0-9]{4}$/).optional().nullable(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => createBankAlias(inner, ctx, b)));
  }),

  r("GET", "/v6/bank/lines", { perm: "import:read" }, async ({ ctx, query, tx }) => {
    const limit = Math.min(Number(query.get("limit") ?? 200) || 200, 500);
    return listBankLines(tx, ctx, limit);
  }),

  // Klasifikasi SELALU keputusan pengguna; tidak ada aksi pembayaran di rute ini.
  r("POST", "/v6/bank/lines/:id/classify", { perm: "import:write" }, async ({ ctx, params, json, idemKey, tx }) => {
    const b = await json(z.object({ classification: z.string().trim().min(1).max(40) }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => classifyBankLine(inner, ctx, params.id, b.classification)));
  }),

  /* ───────────── R11-B/T3: pemetaan SKU ───────────── */
  r("GET", "/v6/marketplace/sku-mappings", { perm: "marketplace:read" }, async ({ ctx, tx }) => skuMappingOverview(tx, ctx)),

  r("PUT", "/v6/marketplace/sku-mappings", { perm: "marketplace:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      channelId: uuid, externalSku: z.string().trim().min(1).max(120), productId: uuid,
      note: z.string().trim().max(200).optional().nullable(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => setSkuMapping(inner, ctx, b)));
  }),

  /* ───────────── R11-B/T3: rekonsiliasi ───────────── */
  r("GET", "/v6/reconciliation/candidates", { perm: "import:read" }, async ({ ctx, query, tx }) => {
    const tolerance = Math.min(Math.max(Number(query.get("toleranceDays") ?? 5) || 5, 0), 30);
    return reconciliationCandidates(tx, ctx, tolerance);
  }),

  r("GET", "/v6/reconciliation/matches", { perm: "import:read" }, async ({ ctx, tx }) => listReconciliationMatches(tx, ctx)),

  r("POST", "/v6/reconciliation/matches", { perm: "import:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      leftKind: z.enum(["settlement_summary", "payment_reference", "cash_receipt"]),
      leftId: uuid, rightId: uuid,
      matchType: z.enum(["one_to_one", "one_to_many", "many_to_one", "partial"]).optional(),
      status: z.enum(["matched", "partial", "unmatched", "discrepancy", "conflict", "manual_review"]).optional(),
      reason: z.string().trim().max(200).optional().nullable(),
      note: z.string().trim().max(400).optional().nullable(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => createReconciliationMatch(inner, ctx, b)));
  }),

  r("DELETE", "/v6/reconciliation/matches/:id", { perm: "import:write" }, async ({ ctx, params, idemKey, tx }) => {
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => unmatchReconciliation(inner, ctx, params.id)));
  }),

  /* ───────────── R11-B/T3: tautan pesanan ke dokumen internal ───────────── */
  r("GET", "/v6/marketplace/orders/:id/links", { perm: "marketplace:read" }, async ({ ctx, params, tx }) =>
    listOrderLinks(tx, ctx, params.id)),

  r("POST", "/v6/marketplace/orders/:id/links", { perm: "marketplace:write" }, async ({ ctx, params, json, idemKey, tx }) => {
    const b = await json(z.object({
      linkKind: z.enum(["sales_order", "invoice"]), linkId: uuid,
      note: z.string().trim().max(200).optional().nullable(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => linkOrderToDocument(inner, ctx, params.id, b)));
  }),

  /* ───────────── R11-E: voucher (catatan diskon), supplier, pusat aturan ───────────── */
  r("GET", "/v6/vouchers", { perm: "marketing:read" }, async ({ ctx, tx }) => ({ items: await listVouchers(tx, ctx) })),

  r("POST", "/v6/vouchers", { perm: "marketing:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      code: z.string().trim().min(2).max(32),
      kind: z.enum(["percent", "amount"]),
      percentBp: z.number().int().min(1).max(10000).optional().nullable(),
      amount: z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
      minPurchase: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      maxDiscount: z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
      validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      quota: z.number().int().min(1).max(1_000_000).optional().nullable(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => createVoucher(inner, ctx, b)));
  }),

  r("POST", "/v6/vouchers/redeem", { perm: "sales:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      code: z.string().trim().min(2).max(32),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      invoiceId: uuid.optional().nullable(),
      onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      note: z.string().trim().max(200).optional().nullable(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => redeemVoucher(inner, ctx, b)));
  }),

  r("GET", "/v6/suppliers", { perm: "purchasing:read" }, async ({ ctx, tx }) => ({ items: await listSuppliers(tx, ctx) })),

  r("POST", "/v6/suppliers", { perm: "purchasing:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(40).optional().nullable(),
      email: z.string().trim().max(160).optional().nullable(),
      address: z.string().trim().max(400).optional().nullable(),
      notes: z.string().trim().max(400).optional().nullable(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => createSupplier(inner, ctx, b)));
  }),

  r("PATCH", "/v6/suppliers/:id", { perm: "purchasing:write" }, async ({ ctx, params, json, idemKey, tx }) => {
    const b = await json(z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().max(40).optional().nullable(),
      email: z.string().trim().max(160).optional().nullable(),
      address: z.string().trim().max(400).optional().nullable(),
      notes: z.string().trim().max(400).optional().nullable(),
      isActive: z.boolean().optional(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => updateSupplier(inner, ctx, params.id, b)));
  }),

  r("GET", "/v6/settings/rules", { perm: "settings:read" }, async ({ ctx, tx }) => getWorkspaceRules(tx, ctx)),

  // PATCH (bukan PUT): permukaan HTTP aplikasi hanya mengekspor GET/POST/PATCH/DELETE.
  r("PATCH", "/v6/settings/rules", { perm: "settings:write" }, async ({ ctx, json, idemKey, tx }) => {
    const b = await json(z.object({
      forecastDefaultWeeks: z.number().int().min(1).max(52).optional(),
      lowStockThreshold: z.string().regex(/^\d+(\.\d{1,3})?$/).optional(),
      invoiceDueDays: z.number().int().min(1).max(365).optional(),
    }));
    return tx.transaction((inner: Tx) => idempotent(inner, ctx, idemKey, () => setWorkspaceRules(inner, ctx, b)));
  }),
];


/** Materi pembelajaran statis — konten nyata, bukan data contoh keuangan. */
const LESSONS = [
  { key: "cash-basics", minutes: 4, title: { id: "Memahami kas vs laba", en: "Cash vs profit" }, summary: { id: "Mengapa saldo kas dan laba bisa berbeda, dan mengapa jurnal adalah sumber tunggal.", en: "Why cash and profit differ, and why the journal is the single source." } },
  { key: "invoice-flow", minutes: 5, title: { id: "Alur faktur & pembayaran", en: "Invoice and payment flow" }, summary: { id: "Dari faktur terbit hingga pelunasan dan jurnal pembalik.", en: "From issuing an invoice to settlement and reversing entries." } },
  { key: "stock-ledger", minutes: 5, title: { id: "Ledger stok", en: "Stock ledger" }, summary: { id: "Setiap pergerakan stok harus punya jejak; penyesuaian tidak menghapus riwayat.", en: "Every stock movement leaves a trace; adjustments never erase history." } },
  { key: "marketplace-fees", minutes: 6, title: { id: "Biaya marketplace & settlement", en: "Marketplace fees and settlement" }, summary: { id: "Bruto, biaya platform, dan penerimaan bersih dicatat terpisah agar tidak dihitung dua kali.", en: "Gross, platform fee and net receipt are recorded separately to avoid double counting." } },
  { key: "personal-separation", minutes: 4, title: { id: "Memisahkan uang pribadi & bisnis", en: "Separating personal and business money" }, summary: { id: "Ruang data pribadi terpisah; jembatan mencatat modal/prive secara eksplisit.", en: "Personal data stays separate; the bridge records capital/drawings explicitly." } },
  { key: "forecast-reading", minutes: 5, title: { id: "Membaca prakiraan kas", en: "Reading a cash forecast" }, summary: { id: "Proyeksi memakai faktur, tagihan, dan beban aktual — bukan asumsi pertumbuhan.", en: "Projections use invoices, bills and actual expenses — not growth assumptions." } },
];
