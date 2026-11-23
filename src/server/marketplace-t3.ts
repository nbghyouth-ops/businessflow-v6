/**
 * Layanan R11-B/T3: alias rekening, klasifikasi mutasi bank, pemetaan SKU,
 * rekonsiliasi, dan tautan pesanan ke dokumen internal.
 *
 * Prinsip yang dipegang di sini:
 *  - aplikasi hanya MENCATAT fakta; tidak ada transfer/pembayaran/refund apa pun;
 *  - klasifikasi bank adalah keputusan PENGGUNA (tidak ada tebakan tersimpan);
 *  - pencocokan rekonsiliasi selalu konfirmasi pengguna + alasan + audit;
 *  - uang = BIGINT unit minor; tidak ada float.
 */
import { sql } from "drizzle-orm";
import { toCents } from "@/lib/money";
import { audit, HttpError, type Ctx, type DB, type Tx } from "./core";

export const BANK_CLASSES = [
  "marketplace_payout",
  "other_income",
  "bank_fee",
  "supplier_payment_recorded",
  "expense",
  "transfer_out",
  "own_account_transfer",
  "other",
  "unknown",
] as const;
export type BankClass = (typeof BANK_CLASSES)[number];

export const MATCH_TYPES = ["one_to_one", "one_to_many", "many_to_one", "partial"] as const;
export const MATCH_STATUSES = ["matched", "partial", "unmatched", "discrepancy", "conflict", "manual_review"] as const;
export const LINK_KINDS = ["sales_order", "invoice"] as const;

/** Bank class palsu/typo ditolak — enum mentah tidak pernah disimpan. */
export function assertBankClass(value: string): BankClass {
  if (!(BANK_CLASSES as readonly string[]).includes(value)) {
    throw new HttpError(422, "Kelas mutasi bank tidak dikenal.", "bad_bank_class");
  }
  return value as BankClass;
}

export async function listBankAliases(tx: Tx | DB, ctx: Ctx) {
  const res = await tx.execute(sql`
    select a.id, a.label, a.bank_label as "bankLabel", a.account_last4 as "last4", a.is_active as "isActive",
      (select count(*)::int from bank_statement_lines l where l.workspace_id = a.workspace_id and l.bank_alias_id = a.id
        and l.published_at is not null) as "lineCount"
    from bank_account_aliases a where a.workspace_id = ${ctx.workspaceId}
    order by a.is_active desc, a.label`);
  return { items: res.rows };
}

export type CreateAliasInput = { label: string; bankLabel?: string | null; accountLast4?: string | null };

export async function createBankAlias(tx: Tx, ctx: Ctx, input: CreateAliasInput) {
  const last4 = input.accountLast4?.trim() || null;
  if (last4 && !/^[0-9]{4}$/.test(last4)) {
    throw new HttpError(422, "Hanya 4 digit terakhir yang boleh disimpan.", "bad_last4");
  }
  const res = await tx.execute(sql`
    insert into bank_account_aliases (workspace_id, business_id, label, bank_label, account_last4)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${input.label.trim()}, ${input.bankLabel?.trim() || null}, ${last4})
    on conflict (workspace_id, lower(label)) do nothing
    returning id, label`);
  const row = res.rows[0] as { id: string } | undefined;
  if (!row) throw new HttpError(409, "Alias dengan label itu sudah ada.", "alias_exists");
  await audit(tx, ctx, "create", "bank_account_alias", row.id);
  return { item: row };
}

export async function listBankLines(tx: Tx | DB, ctx: Ctx, limit = 200) {
  const res = await tx.execute(sql`
    select l.id, l.posted_on::text as "postedOn", l.transaction_on::text as "transactionOn", l.description,
      l.amount::text as amount, l.balance::text as balance, l.direction, l.currency,
      l.bank_alias_id as "bankAliasId", a.label as "aliasLabel",
      l.suggested_class as "suggestedClass", l.confirmed_class as "confirmedClass",
      (l.confirmed_class is not null) as classified
    from bank_statement_lines l
    left join bank_account_aliases a on a.workspace_id = l.workspace_id and a.id = l.bank_alias_id
    where l.workspace_id = ${ctx.workspaceId} and l.published_at is not null
    order by l.posted_on desc nulls last, l.created_at desc limit ${limit}`);
  return { items: res.rows };
}

/** Konfirmasi klasifikasi oleh pengguna (saran tidak pernah disimpan otomatis). */
export async function classifyBankLine(tx: Tx, ctx: Ctx, lineId: string, classification: string) {
  const cls = assertBankClass(classification);
  const res = await tx.execute(sql`
    update bank_statement_lines
      set confirmed_class = ${cls}, classified_by = ${ctx.userId ?? null}, classified_at = now(), suggestion_confirmed = true
      where workspace_id = ${ctx.workspaceId} and id = ${lineId}
      returning id, confirmed_class as "confirmedClass"`);
  const row = res.rows[0] as { id: string; confirmedClass: string } | undefined;
  if (!row) throw new HttpError(404, "Baris mutasi bank tidak ditemukan.", "not_found");
  await audit(tx, ctx, "classify", "bank_statement_line", row.id, { classification: cls });
  return { item: row };
}

export async function skuMappingOverview(tx: Tx | DB, ctx: Ctx) {
  const res = await tx.execute(sql`
    select i.channel_id as "channelId", c.name as "channelName", i.seller_sku as "sellerSku",
      count(*)::int as "lineCount", max(i.currency) as currency,
      m.product_id as "productId", p.name as "productName", p.sku as "productSku"
    from marketplace_order_items i
    join marketplace_channels c on c.workspace_id = i.workspace_id and c.id = i.channel_id
    left join marketplace_sku_mappings m
      on m.workspace_id = i.workspace_id and m.channel_id = i.channel_id and lower(m.external_sku) = lower(i.seller_sku)
    left join products p on p.workspace_id = i.workspace_id and p.id = m.product_id
    where i.workspace_id = ${ctx.workspaceId} and i.seller_sku is not null and btrim(i.seller_sku) <> ''
    group by i.channel_id, c.name, i.seller_sku, m.product_id, p.name, p.sku
    order by (m.product_id is null) desc, i.seller_sku
    limit 500`);
  const unmapped = (res.rows as Array<{ productId: string | null }>).filter((r) => !r.productId).length;
  return { items: res.rows, unmapped };
}

export async function setSkuMapping(
  tx: Tx, ctx: Ctx,
  input: { channelId: string; externalSku: string; productId: string; note?: string | null },
) {
  const product = await tx.execute(sql`
    select id from products where workspace_id = ${ctx.workspaceId} and id = ${input.productId} limit 1`);
  if (product.rows.length === 0) throw new HttpError(404, "Produk tidak ditemukan.", "not_found");
  const channel = await tx.execute(sql`
    select id from marketplace_channels where workspace_id = ${ctx.workspaceId} and id = ${input.channelId} limit 1`);
  if (channel.rows.length === 0) throw new HttpError(404, "Kanal marketplace tidak ditemukan.", "not_found");
  const res = await tx.execute(sql`
    insert into marketplace_sku_mappings (workspace_id, business_id, channel_id, external_sku, product_id, note, created_by)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${input.channelId}, ${input.externalSku.trim()}, ${input.productId},
      ${input.note?.trim() || null}, ${ctx.userId ?? null})
    on conflict (workspace_id, channel_id, lower(external_sku))
      do update set product_id = excluded.product_id, note = excluded.note, created_by = excluded.created_by
    returning id, external_sku as "externalSku", product_id as "productId"`);
  const row = res.rows[0] as { id: string } | undefined;
  if (!row) throw new HttpError(422, "Pemetaan SKU gagal disimpan.", "sku_mapping_failed");
  await audit(tx, ctx, "upsert", "marketplace_sku_mapping", row.id, { externalSku: input.externalSku });
  return { item: row };
}

/**
 * Kandidat pencocokan: settlement/payment-reference ↔ mutasi bank masuk.
 * Nominal harus EKSAK; tanggal hanya menyaring (toleransi), rujukan menambah skor.
 * Fungsi ini TIDAK menulis apa pun.
 */
export async function reconciliationCandidates(tx: Tx | DB, ctx: Ctx, toleranceDays = 5) {
  const res = await tx.execute(sql`
    with left_side as (
      select 'settlement_summary'::text as left_kind, s.id as left_id, s.statement_on as on_date,
             s.settlement_total as amount, s.currency, coalesce(s.statement_reference, '') as ref
      from marketplace_settlement_summaries s
      where s.workspace_id = ${ctx.workspaceId} and s.published_at is not null
      union all
      select 'payment_reference'::text, p.id, p.referenced_on, p.amount, p.currency, p.external_payment_ref
      from marketplace_external_payment_references p
      where p.workspace_id = ${ctx.workspaceId} and p.amount is not null
        and exists (
          select 1 from marketplace_settlement_lines sl
          where sl.workspace_id = p.workspace_id and sl.id = p.settlement_line_id and sl.published_at is not null)
    )
    select l.left_kind as "leftKind", l.left_id as "leftId", l.ref, l.currency,
           l.on_date::text as "leftDate", l.amount::text as "leftAmount",
           b.id as "bankLineId", b.posted_on::text as "bankDate", b.amount::text as "bankAmount", b.description,
           (case when l.on_date is null or b.posted_on is null then 99
                 else abs(b.posted_on - l.on_date) end) as "dayGap",
           (50
             + (case when l.on_date is not null and b.posted_on is not null
                       and abs(b.posted_on - l.on_date) <= ${toleranceDays} then 20 else 0 end)
             + (case when l.ref <> '' and b.description ilike '%' || l.ref || '%' then 30 else 0 end)) as score
    from left_side l
    join bank_statement_lines b
      on b.workspace_id = ${ctx.workspaceId} and b.amount = l.amount and b.amount > 0 and b.published_at is not null
    where (l.on_date is null or b.posted_on is null or abs(b.posted_on - l.on_date) <= ${toleranceDays})
      and not exists (
        select 1 from bank_reconciliation_matches m
        where m.workspace_id = ${ctx.workspaceId} and m.unmatched_at is null
          and ((m.left_kind = l.left_kind and m.left_id = l.left_id)
            or (m.right_kind = 'bank_line' and m.right_id = b.id))
      )
    order by score desc, l.on_date desc nulls last
    limit 100`);
  return {
    items: res.rows,
    note: "Kandidat saja: pencocokan tersimpan hanya setelah Anda mengonfirmasi, dengan alasan dan audit.",
  };
}

export async function listReconciliationMatches(tx: Tx | DB, ctx: Ctx) {
  const res = await tx.execute(sql`
    select m.id, m.left_kind as "leftKind", m.left_id as "leftId", m.right_kind as "rightKind", m.right_id as "rightId",
      m.match_type as "matchType", m.status, m.matched_amount::text as "matchedAmount", m.currency,
      m.difference::text as difference, m.score, m.reason, m.confirmed_at as "confirmedAt",
      (m.unmatched_at is not null) as "unmatched"
    from bank_reconciliation_matches m
    where m.workspace_id = ${ctx.workspaceId}
    order by m.created_at desc limit 200`);
  return { items: res.rows };
}

const LEFT_SOURCE: Record<string, { table: string; amount: string; date: string }> = {
  settlement_summary: { table: "marketplace_settlement_summaries", amount: "settlement_total", date: "statement_on" },
  payment_reference: { table: "marketplace_external_payment_references", amount: "amount", date: "referenced_on" },
  cash_receipt: { table: "marketplace_cash_receipts", amount: "amount", date: "occurred_on" },
};

export type CreateMatchInput = {
  leftKind: string;
  leftId: string;
  rightId: string;
  matchType?: string;
  status?: string;
  reason?: string | null;
  note?: string | null;
};

export async function createReconciliationMatch(tx: Tx, ctx: Ctx, input: CreateMatchInput) {
  const source = LEFT_SOURCE[input.leftKind];
  if (!source) throw new HttpError(422, "Jenis sumber pencocokan tidak dikenal.", "bad_left_kind");
  const matchType = input.matchType ?? "one_to_one";
  if (!(MATCH_TYPES as readonly string[]).includes(matchType)) {
    throw new HttpError(422, "Jenis pencocokan tidak dikenal.", "bad_match_type");
  }
  const left = await tx.execute(sql`
    select ${sql.raw(source.amount)}::text as amount, currency, ${sql.raw(source.date)}::text as on_date
    from ${sql.raw(source.table)}
    where workspace_id = ${ctx.workspaceId} and id = ${input.leftId} limit 1`);
  const leftRow = left.rows[0] as { amount: string | null; currency: string | null } | undefined;
  if (!leftRow) throw new HttpError(404, "Sumber pencocokan tidak ditemukan.", "not_found");

  const right = await tx.execute(sql`
    select amount::text as amount, currency, posted_on::text as on_date
    from bank_statement_lines where workspace_id = ${ctx.workspaceId} and id = ${input.rightId} and published_at is not null limit 1`);
  const rightRow = right.rows[0] as { amount: string | null; currency: string | null } | undefined;
  if (!rightRow) throw new HttpError(404, "Baris mutasi bank tidak ditemukan.", "not_found");
  if (leftRow.amount === null || rightRow.amount === null) {
    throw new HttpError(422, "Nominal salah satu sisi belum diketahui; pencocokan tidak dapat dikonfirmasi.", "amount_unknown");
  }
  const difference = BigInt(leftRow.amount) - BigInt(rightRow.amount);
  const status = input.status ?? (difference === 0n ? "matched" : "partial");
  if (!(MATCH_STATUSES as readonly string[]).includes(status)) {
    throw new HttpError(422, "Status pencocokan tidak dikenal.", "bad_match_status");
  }
  if (leftRow.currency && rightRow.currency && leftRow.currency !== rightRow.currency) {
    throw new HttpError(422, "Mata uang berbeda tidak boleh dicocokkan.", "currency_mismatch");
  }

  const res = await tx.execute(sql`
    insert into bank_reconciliation_matches
      (workspace_id, business_id, left_kind, left_id, right_kind, right_id, match_type, status,
       matched_amount, currency, difference, reason, note, confirmed_by, confirmed_at)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${input.leftKind}, ${input.leftId}, 'bank_line', ${input.rightId},
      ${matchType}, ${status}, ${rightRow.amount}::bigint, ${leftRow.currency ?? rightRow.currency ?? null},
      ${difference.toString()}::bigint, ${input.reason?.trim() || null}, ${input.note?.trim() || null},
      ${ctx.userId ?? null}, now())
    on conflict (workspace_id, left_kind, left_id, right_kind, right_id) where unmatched_at is null do nothing
    returning id, status`);
  const row = res.rows[0] as { id: string; status: string } | undefined;
  if (!row) throw new HttpError(409, "Pencocokan itu sudah dikonfirmasi sebelumnya.", "already_matched");
  await audit(tx, ctx, "reconcile.match", "bank_reconciliation_match", row.id, {
    leftKind: input.leftKind, leftId: input.leftId, rightId: input.rightId, status,
  });
  return { item: { ...row, difference: difference.toString() } };
}

export async function unmatchReconciliation(tx: Tx, ctx: Ctx, id: string) {
  const res = await tx.execute(sql`
    update bank_reconciliation_matches
      set unmatched_at = now(), unmatched_by = ${ctx.userId ?? null}
      where workspace_id = ${ctx.workspaceId} and id = ${id} and unmatched_at is null
      returning id`);
  const row = res.rows[0] as { id: string } | undefined;
  if (!row) throw new HttpError(404, "Pencocokan aktif tidak ditemukan.", "not_found");
  await audit(tx, ctx, "reconcile.unmatch", "bank_reconciliation_match", row.id);
  return { item: row };
}

/** Tautan pesanan marketplace ke dokumen internal (tanpa double count). */
export async function linkOrderToDocument(
  tx: Tx, ctx: Ctx, orderId: string,
  input: { linkKind: string; linkId: string; note?: string | null },
) {
  if (!(LINK_KINDS as readonly string[]).includes(input.linkKind)) {
    throw new HttpError(422, "Jenis dokumen tautan tidak dikenal.", "bad_link_kind");
  }
  const order = await tx.execute(sql`
    select id, net_amount::text as amount, currency from marketplace_orders
    where workspace_id = ${ctx.workspaceId} and id = ${orderId} and published_at is not null limit 1`);
  const orderRow = order.rows[0] as { id: string; amount: string; currency: string | null } | undefined;
  if (!orderRow) throw new HttpError(404, "Pesanan marketplace tidak ditemukan.", "not_found");
  const table = input.linkKind === "invoice" ? "invoices" : "sales_orders";
  const doc = await tx.execute(sql`
    select id from ${sql.raw(table)} where workspace_id = ${ctx.workspaceId} and id = ${input.linkId} limit 1`);
  if (doc.rows.length === 0) throw new HttpError(404, "Dokumen internal tidak ditemukan.", "not_found");
  const existing = await tx.execute(sql`
    select link_id as "linkId" from marketplace_order_links
    where workspace_id = ${ctx.workspaceId} and order_id = ${orderId} and link_kind = ${input.linkKind} limit 1`);
  const linked = existing.rows[0] as { linkId: string } | undefined;
  if (linked && linked.linkId !== input.linkId) {
    throw new HttpError(409, "Pesanan ini sudah tertaut ke dokumen lain pada jenis yang sama.", "order_already_linked");
  }
  const res = await tx.execute(sql`
    insert into marketplace_order_links (workspace_id, business_id, order_id, link_kind, link_id, status, amount, currency, note, created_by)
    values (${ctx.workspaceId}, ${ctx.businessId}, ${orderId}, ${input.linkKind}, ${input.linkId}, 'linked',
      ${toCents(orderRow.amount).toString()}::bigint, ${orderRow.currency}, ${input.note?.trim() || null}, ${ctx.userId ?? null})
    on conflict (workspace_id, order_id, link_kind, link_id) do nothing
    returning id, status`);
  const row = res.rows[0] as { id: string; status: string } | undefined;
  if (!row) throw new HttpError(409, "Tautan itu sudah ada.", "link_exists");
  await audit(tx, ctx, "link", "marketplace_order", orderId, { linkKind: input.linkKind, linkId: input.linkId });
  return { item: row };
}

export async function listOrderLinks(tx: Tx | DB, ctx: Ctx, orderId: string) {
  const res = await tx.execute(sql`
    select id, link_kind as "linkKind", link_id as "linkId", status, amount::text as amount, currency, created_at as "createdAt"
    from marketplace_order_links where workspace_id = ${ctx.workspaceId} and order_id = ${orderId}
    order by created_at`);
  return { items: res.rows };
}
