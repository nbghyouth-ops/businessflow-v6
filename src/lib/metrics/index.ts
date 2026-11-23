/**
 * Lapisan METRIK LAPORAN — satu sumber angka untuk tiga laporan R11-C (R17 §A5).
 *
 * Aturan yang dijaga di sini:
 *  - Semua agregasi dijalankan di SERVER (SQL), tidak pernah menarik semua baris ke klien.
 *  - Tidak ada pencampuran basis: nilai pesanan menurut sumber · settlement dilaporkan ·
 *    biaya marketplace · kredit bank matched · pendapatan posted · laba adalah metrik
 *    TERPISAH; tidak ada satu "Total Pendapatan" yang menjumlahkan order+settlement+bank.
 *  - Uang selalu BigInt unit minor di sisi JS, dikembalikan sebagai string desimal eksak
 *    (tanpa float). `NULL`/tak-tersedia = `null` + alasan, BUKAN 0.
 *  - Hanya baris TERBIT (`published_at is not null`) dari impor yang dihitung.
 *  - Setiap metrik membawa definisi, sumber, basis tanggal, dan status kelengkapan agar
 *    UI dan dokumen `docs/reports/*.md` tidak dapat menyimpang.
 */
import { sql } from "drizzle-orm";
import { toCents } from "@/lib/money";
import type { DB } from "@/server/core";

export type MetricUnit = "money" | "count";

export type MetricDefinition = {
  code: string;
  label: string;
  /** Definisi bisnis singkat (juga dipakai dokumen laporan). */
  definition: string;
  /** Tabel sumber — dipakai untuk transparansi di UI/dokumen. */
  source: string;
  /** Jenis tanggal yang dipakai memfilter periode. */
  basis: "order_date" | "statement_date" | "bank_date" | "posted_date" | "issued_at";
  unit: MetricUnit;
  /** Laporan tempat metrik ini tampil. */
  report: "marketplace" | "revenue" | "pnl";
};

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    code: "marketplace.orders_count",
    label: "Jumlah pesanan",
    definition: "Banyaknya pesanan unik yang tercatat dari berkas impor pesanan yang sudah diterbitkan.",
    source: "marketplace_orders",
    basis: "order_date",
    unit: "count",
    report: "marketplace",
  },
  {
    code: "marketplace.gross_amount",
    label: "Nilai pesanan menurut sumber",
    definition: "Jumlah nilai pesanan seperti tertulis di berkas sumber (bukan pendapatan akuntansi).",
    source: "marketplace_orders.gross_amount",
    basis: "order_date",
    unit: "money",
    report: "marketplace",
  },
  {
    code: "marketplace.completed_count",
    label: "Pesanan selesai",
    definition: "Pesanan berstatus selesai/terkirim/dibayar menurut pemetaan status yang tersimpan.",
    source: "marketplace_orders.status",
    basis: "order_date",
    unit: "count",
    report: "marketplace",
  },
  {
    code: "marketplace.settlement_reported",
    label: "Settlement dilaporkan",
    definition: "Total settlement yang DILAPORKAN sumber pada ringkasan statement. Bukan kas diterima.",
    source: "marketplace_settlement_summaries.settlement_total",
    basis: "statement_date",
    unit: "money",
    report: "marketplace",
  },
  {
    code: "marketplace.fees_reported",
    label: "Biaya marketplace dilaporkan",
    definition: "Total biaya/komisi yang tertulis pada ringkasan settlement; tidak memakai tarif dugaan.",
    source: "marketplace_settlement_summaries.fee_total",
    basis: "statement_date",
    unit: "money",
    report: "marketplace",
  },
  {
    code: "marketplace.bank_matched",
    label: "Pencairan tercatat di bank (matched)",
    definition: "Kredit mutasi bank yang sudah dicocokkan dan dikonfirmasi pengguna. Bukan pendapatan.",
    source: "bank_statement_lines + bank_reconciliation_matches",
    basis: "bank_date",
    unit: "money",
    report: "marketplace",
  },
  {
    code: "marketplace.bank_unmatched",
    label: "Belum cocok",
    definition: "Kredit mutasi bank yang belum punya pencocokan terkonfirmasi.",
    source: "bank_statement_lines",
    basis: "bank_date",
    unit: "money",
    report: "marketplace",
  },
  {
    code: "marketplace.returns_recorded",
    label: "Retur/refund tercatat",
    definition: "Nilai refund yang tercatat pada baris settlement. Catatan hasil eksternal, bukan eksekusi.",
    source: "marketplace_settlement_lines.refund_amount",
    basis: "statement_date",
    unit: "money",
    report: "marketplace",
  },
  {
    code: "revenue.posted_revenue",
    label: "Pendapatan posted",
    definition: "Pendapatan dari jurnal berstatus posted pada akun bertipe revenue (kredit − debit).",
    source: "journal_entries + journal_lines + coa_accounts",
    basis: "posted_date",
    unit: "money",
    report: "revenue",
  },
  {
    code: "revenue.invoices_total",
    label: "Nilai invoice diterbitkan",
    definition: "Total nilai invoice yang diterbitkan pada periode (status apa pun, termasuk reversed).",
    source: "invoices.total",
    basis: "issued_at",
    unit: "money",
    report: "revenue",
  },
  {
    code: "revenue.invoices_paid",
    label: "Invoice lunas",
    definition: "Nilai invoice berstatus paid pada periode penerbitan.",
    source: "invoices.total",
    basis: "issued_at",
    unit: "money",
    report: "revenue",
  },
  {
    code: "revenue.invoices_open",
    label: "Invoice terbuka/terlambat",
    definition: "Nilai invoice berstatus unpaid/partial pada periode penerbitan.",
    source: "invoices.total",
    basis: "issued_at",
    unit: "money",
    report: "revenue",
  },
  {
    code: "pnl.revenue",
    label: "Pendapatan bersih",
    definition: "Pendapatan akun revenue (kredit − debit) dikurangi kontra-pendapatan (saldo debit).",
    source: "journal_lines + coa_accounts",
    basis: "posted_date",
    unit: "money",
    report: "pnl",
  },
  {
    code: "pnl.cogs",
    label: "Harga pokok penjualan (HPP)",
    definition: "Saldo akun bertipe expense bersubtipe cogs. 'Tidak lengkap' bila tak ada akun HPP terpetakan.",
    source: "journal_lines + coa_accounts (subtype cogs)",
    basis: "posted_date",
    unit: "money",
    report: "pnl",
  },
  {
    code: "pnl.expense",
    label: "Beban",
    definition: "Saldo akun beban selain HPP. 'Beban' BUKAN 'kewajiban' (D-30).",
    source: "journal_lines + coa_accounts (expense, bukan cogs)",
    basis: "posted_date",
    unit: "money",
    report: "pnl",
  },
  {
    code: "pnl.tax",
    label: "Pajak tercatat",
    definition: "Saldo akun beban bersubtipe tax. Hanya yang tercatat; tidak mengarang tarif.",
    source: "journal_lines + coa_accounts (subtype tax)",
    basis: "posted_date",
    unit: "money",
    report: "pnl",
  },
];

const BY_CODE = new Map(METRIC_DEFINITIONS.map((m) => [m.code, m]));

export function metricDefinition(code: string): MetricDefinition | undefined {
  return BY_CODE.get(code);
}

export type ReportRange = {
  from: string;
  to: string;
  currency: string;
  channelId?: string | null;
  status?: string | null;
};

export type MetricValue = {
  code: string;
  label: string;
  unit: MetricUnit;
  /** Nilai uang dalam unit minor (string desimal eksak) atau null bila tak tersedia. */
  minor: string | null;
  /** Nilai hitung (untuk unit count). */
  count: number | null;
  currency: string;
  basis: MetricDefinition["basis"];
  complete: boolean;
  reason?: string;
};

const MINOR_ZERO = 0n;

/**
 * Jumlah uang dari kolom `numeric` (mis. invoices.total, marketplace_orders.gross_amount).
 * `SUM()` atas nol baris mengembalikan satu baris bernilai NULL — itu berarti "belum ada data",
 * bukan 0. Mengembalikan 0 di situ akan melanggar aturan "tanpa data → bukan 0".
 */
function sumNumeric(rows: Array<{ v: string | null }>): bigint | null {
  const present = rows.filter((r) => r.v !== null);
  if (present.length === 0) return null;
  let total = MINOR_ZERO;
  for (const r of present) total += toCents(r.v as string);
  return total;
}

/** Jumlah uang dari kolom BIGINT unit minor (mis. settlement_total, refund_amount). */
function sumMinor(rows: Array<{ v: string | null }>): bigint | null {
  const present = rows.filter((r) => r.v !== null);
  if (present.length === 0) return null;
  let total = MINOR_ZERO;
  for (const r of present) total += BigInt(r.v as string);
  return total;
}

function moneyValue(def: MetricDefinition, total: bigint | null, range: ReportRange, reason?: string): MetricValue {
  return {
    code: def.code,
    label: def.label,
    unit: def.unit,
    minor: total === null ? null : total.toString(),
    count: null,
    currency: range.currency,
    basis: def.basis,
    complete: total !== null,
    reason: total === null ? reason ?? "no_rows" : undefined,
  };
}

function countValue(def: MetricDefinition, count: number | null, range: ReportRange, reason?: string): MetricValue {
  return {
    code: def.code,
    label: def.label,
    unit: def.unit,
    minor: null,
    count,
    currency: range.currency,
    basis: def.basis,
    complete: count !== null,
    reason: count === null ? reason ?? "no_rows" : undefined,
  };
}

/**
 * SATU pintu masuk untuk semua angka laporan (R17 §A5).
 *
 * Pemanggil menyebut kode metrik + rentang; definisi/basis/sumbernya tidak dapat
 * ditawar di tempat lain, sehingga UI, ekspor, dan dokumen memakai arti yang sama.
 */
export async function computeMetric(
  tx: DB,
  workspaceId: string,
  code: string,
  range: ReportRange,
): Promise<MetricValue> {
  const def = BY_CODE.get(code);
  if (!def) throw new Error(`Metrik laporan tidak dikenal: ${code}`);
  const channel = range.channelId ?? null;
  const status = range.status ?? null;

  const marketplaceFilter = sql`o.workspace_id = ${workspaceId} and o.published_at is not null
    and o.occurred_on between ${range.from}::date and ${range.to}::date
    and (${channel}::uuid is null or o.channel_id = ${channel}::uuid)
    and (${status}::text is null or o.status = ${status}::text)`;

  switch (code) {
    case "marketplace.orders_count": {
      const r = await tx.execute(sql`select count(*)::int as n from marketplace_orders o where ${marketplaceFilter}`);
      return countValue(def, (r.rows[0] as { n: number }).n, range);
    }
    case "marketplace.completed_count": {
      const r = await tx.execute(sql`select count(*)::int as n from marketplace_orders o
        where ${marketplaceFilter} and o.status in ('completed', 'delivered', 'paid')`);
      return countValue(def, (r.rows[0] as { n: number }).n, range);
    }
    case "marketplace.gross_amount": {
      const r = await tx.execute(sql`select sum(o.gross_amount)::text as v from marketplace_orders o where ${marketplaceFilter}`);
      return moneyValue(def, sumNumeric(r.rows as Array<{ v: string | null }>), range);
    }
    case "marketplace.settlement_reported": {
      const r = await tx.execute(sql`select sum(s.settlement_total)::text as v
        from marketplace_settlement_summaries s
        where s.workspace_id = ${workspaceId} and s.published_at is not null
          and s.statement_on between ${range.from}::date and ${range.to}::date
          and (${channel}::uuid is null or s.channel_id = ${channel}::uuid)`);
      return moneyValue(def, sumMinor(r.rows as Array<{ v: string | null }>), range);
    }
    case "marketplace.fees_reported": {
      const r = await tx.execute(sql`select sum(s.fee_total)::text as v
        from marketplace_settlement_summaries s
        where s.workspace_id = ${workspaceId} and s.published_at is not null
          and s.statement_on between ${range.from}::date and ${range.to}::date
          and (${channel}::uuid is null or s.channel_id = ${channel}::uuid)`);
      return moneyValue(def, sumMinor(r.rows as Array<{ v: string | null }>), range);
    }
    case "marketplace.returns_recorded": {
      const r = await tx.execute(sql`select sum(l.refund_amount)::text as v
        from marketplace_settlement_lines l
        where l.workspace_id = ${workspaceId} and l.published_at is not null
          and l.statement_on between ${range.from}::date and ${range.to}::date
          and (${channel}::uuid is null or l.channel_id = ${channel}::uuid)`);
      return moneyValue(def, sumMinor(r.rows as Array<{ v: string | null }>), range);
    }
    case "marketplace.bank_matched":
    case "marketplace.bank_unmatched": {
      const matched = code === "marketplace.bank_matched";
      const r = await tx.execute(sql`select coalesce(sum(b.amount), 0)::text as v
        from bank_statement_lines b
        where b.workspace_id = ${workspaceId} and b.published_at is not null
          and b.direction = 'credit'
          and coalesce(b.transaction_on, b.posted_on) between ${range.from}::date and ${range.to}::date
          and (${matched}::boolean = exists (
            select 1 from bank_reconciliation_matches m
             where m.workspace_id = ${workspaceId} and m.status = 'confirmed'
               and (m.left_id = b.id or m.right_id = b.id)))
        having count(*) > 0`);
      return moneyValue(def, sumMinor(r.rows as Array<{ v: string | null }>), range);
    }
    case "revenue.posted_revenue": {
      const r = await tx.execute(sql`select sum(l.credit - l.debit)::text as v
        from journal_lines l
        join journal_entries e on e.id = l.entry_id and e.workspace_id = l.workspace_id
        join coa_accounts a on a.id = l.account_id and a.workspace_id = l.workspace_id
        where l.workspace_id = ${workspaceId} and e.status = 'posted' and a.type = 'revenue'
          and e.entry_date between ${range.from}::date and ${range.to}::date`);
      return moneyValue(def, sumNumeric(r.rows as Array<{ v: string | null }>), range);
    }
    case "revenue.invoices_total":
    case "revenue.invoices_paid":
    case "revenue.invoices_open": {
      const cond =
        code === "revenue.invoices_paid"
          ? sql`and i.status = 'paid'`
          : code === "revenue.invoices_open"
            ? sql`and i.status in ('unpaid', 'partial')`
            : sql``;
      const r = await tx.execute(sql`select sum(i.total)::text as v from invoices i
        where i.workspace_id = ${workspaceId}
          and (i.issued_at at time zone 'UTC')::date between ${range.from}::date and ${range.to}::date ${cond}`);
      return moneyValue(def, sumNumeric(r.rows as Array<{ v: string | null }>), range);
    }
    case "pnl.revenue": {
      const r = await tx.execute(sql`select sum(l.credit - l.debit)::text as v
        from journal_lines l
        join journal_entries e on e.id = l.entry_id and e.workspace_id = l.workspace_id
        join coa_accounts a on a.id = l.account_id and a.workspace_id = l.workspace_id
        where l.workspace_id = ${workspaceId} and e.status = 'posted' and a.type = 'revenue'
          and e.entry_date between ${range.from}::date and ${range.to}::date`);
      return moneyValue(def, sumNumeric(r.rows as Array<{ v: string | null }>), range);
    }
    case "pnl.cogs":
    case "pnl.expense":
    case "pnl.tax": {
      const subtypeCond =
        code === "pnl.cogs"
          ? sql`a.subtype = 'cogs'`
          : code === "pnl.tax"
            ? sql`a.subtype = 'tax'`
            : sql`(a.subtype is null or a.subtype not in ('cogs', 'tax'))`;
      const r = await tx.execute(sql`select sum(l.debit - l.credit)::text as v
        from journal_lines l
        join journal_entries e on e.id = l.entry_id and e.workspace_id = l.workspace_id
        join coa_accounts a on a.id = l.account_id and a.workspace_id = l.workspace_id
        where l.workspace_id = ${workspaceId} and e.status = 'posted' and a.type = 'expense' and ${subtypeCond}
          and e.entry_date between ${range.from}::date and ${range.to}::date`);
      return moneyValue(def, sumNumeric(r.rows as Array<{ v: string | null }>), range);
    }
    default:
      throw new Error(`Metrik laporan belum diimplementasikan: ${code}`);
  }
}

/* ───────────────────────── Laporan ───────────────────────── */

export type SeriesPoint = { date: string; minor: string; currency: string };
export type DailyRow = { date: string; orders: number; grossMinor: string | null };
export type ChannelRow = { name: string; orders: number; grossMinor: string | null };
export type OrderRow = {
  orderRef: string;
  occurredOn: string;
  status: string;
  grossMinor: string | null;
  currency: string;
};

export type MarketplacePerformance = {
  report: "marketplace";
  range: { from: string; to: string; currency: string };
  kpis: MetricValue[];
  daily: DailyRow[];
  channels: ChannelRow[];
  orders: OrderRow[];
  lastImportAt: string | null;
};

/** Performa Penjualan Marketplace — semua angka dari baris impor yang sudah terbit. */
export async function marketplacePerformance(
  tx: DB,
  workspaceId: string,
  range: ReportRange,
): Promise<MarketplacePerformance> {
  const codes = [
    "marketplace.orders_count",
    "marketplace.gross_amount",
    "marketplace.completed_count",
    "marketplace.settlement_reported",
    "marketplace.fees_reported",
    "marketplace.bank_matched",
    "marketplace.bank_unmatched",
    "marketplace.returns_recorded",
  ];
  const kpis: MetricValue[] = [];
  for (const code of codes) kpis.push(await computeMetric(tx, workspaceId, code, range));

  const dailyRes = await tx.execute(sql`
    select o.occurred_on::text as date, count(*)::int as orders, sum(o.gross_amount)::text as gross
      from marketplace_orders o
     where o.workspace_id = ${workspaceId} and o.published_at is not null
       and o.occurred_on between ${range.from}::date and ${range.to}::date
       and (${range.channelId ?? null}::uuid is null or o.channel_id = ${range.channelId ?? null}::uuid)
       and (${range.status ?? null}::text is null or o.status = ${range.status ?? null}::text)
     group by o.occurred_on order by o.occurred_on`);
  const daily: DailyRow[] = (dailyRes.rows as Array<{ date: string; orders: number; gross: string | null }>).map((r) => ({
    date: r.date,
    orders: r.orders,
    grossMinor: r.gross === null ? null : toCents(r.gross).toString(),
  }));

  const channelRes = await tx.execute(sql`
    select c.name, count(*)::int as orders, sum(o.gross_amount)::text as gross
      from marketplace_orders o join marketplace_channels c on c.id = o.channel_id
     where o.workspace_id = ${workspaceId} and o.published_at is not null
       and o.occurred_on between ${range.from}::date and ${range.to}::date
     group by c.name order by sum(o.gross_amount) desc nulls last`);
  const channels: ChannelRow[] = (channelRes.rows as Array<{ name: string; orders: number; gross: string | null }>).map((r) => ({
    name: r.name,
    orders: r.orders,
    grossMinor: r.gross === null ? null : toCents(r.gross).toString(),
  }));

  const ordersRes = await tx.execute(sql`
    select coalesce(o.external_order_ref, o.order_no) as ref, o.occurred_on::text as date, o.status,
           o.gross_amount::text as gross, coalesce(o.currency, ${range.currency}) as currency
      from marketplace_orders o
     where o.workspace_id = ${workspaceId} and o.published_at is not null
       and o.occurred_on between ${range.from}::date and ${range.to}::date
     order by o.occurred_on desc, coalesce(o.external_order_ref, o.order_no) desc limit 100`);
  const orders: OrderRow[] = (ordersRes.rows as Array<{ ref: string; date: string; status: string; gross: string | null; currency: string }>).map(
    (r) => ({
      orderRef: r.ref,
      occurredOn: r.date,
      status: r.status,
      grossMinor: r.gross === null ? null : toCents(r.gross).toString(),
      currency: r.currency,
    }),
  );

  const lastRes = await tx.execute(sql`select max(created_at)::text as at from import_batches
    where workspace_id = ${workspaceId} and status = 'COMMITTED'`);
  const lastImportAt = (lastRes.rows[0] as { at: string | null } | undefined)?.at ?? null;

  return {
    report: "marketplace",
    range: { from: range.from, to: range.to, currency: range.currency },
    kpis,
    daily,
    channels,
    orders,
    lastImportAt,
  };
}

export type TrendPoint = { bucket: string; revenueMinor: string; expenseMinor: string };
export type NamedRow = { name: string; count: number; minor: string | null };
export type InvoiceRow = {
  number: string;
  client: string | null;
  issuedOn: string;
  dueOn: string | null;
  status: string;
  currency: string;
  totalMinor: string | null;
  balanceMinor: string | null;
};

export type RevenueOverview = {
  report: "revenue";
  range: { from: string; to: string; currency: string };
  kpis: MetricValue[];
  trend: TrendPoint[];
  customers: NamedRow[];
  products: NamedRow[];
  invoices: InvoiceRow[];
};

/** Revenue Overview — hanya transaksi/jurnal POSTED dan invoice yang benar-benar ada. */
export async function revenueOverview(tx: DB, workspaceId: string, range: ReportRange): Promise<RevenueOverview> {
  const codes = ["revenue.posted_revenue", "revenue.invoices_total", "revenue.invoices_paid", "revenue.invoices_open"];
  const kpis: MetricValue[] = [];
  for (const code of codes) kpis.push(await computeMetric(tx, workspaceId, code, range));

  const trendRes = await tx.execute(sql`
    select to_char(date_trunc('month', e.entry_date), 'YYYY-MM') as bucket,
           sum(case when a.type = 'revenue' then l.credit - l.debit else 0 end)::text as revenue,
           sum(case when a.type = 'expense' then l.debit - l.credit else 0 end)::text as expense
      from journal_lines l
      join journal_entries e on e.id = l.entry_id and e.workspace_id = l.workspace_id
      join coa_accounts a on a.id = l.account_id and a.workspace_id = l.workspace_id
     where l.workspace_id = ${workspaceId} and e.status = 'posted'
       and e.entry_date between ${range.from}::date and ${range.to}::date
       and a.type in ('revenue', 'expense')
     group by 1 order by 1`);
  const trend: TrendPoint[] = (trendRes.rows as Array<{ bucket: string; revenue: string | null; expense: string | null }>).map((r) => ({
    bucket: r.bucket,
    revenueMinor: (r.revenue === null ? 0n : toCents(r.revenue)).toString(),
    expenseMinor: (r.expense === null ? 0n : toCents(r.expense)).toString(),
  }));

  const custRes = await tx.execute(sql`
    select coalesce(c.name, 'Tanpa pelanggan') as name, count(*)::int as n, sum(i.total)::text as total
      from invoices i left join clients c on c.id = i.client_id and c.workspace_id = i.workspace_id
     where i.workspace_id = ${workspaceId}
       and (i.issued_at at time zone 'UTC')::date between ${range.from}::date and ${range.to}::date
     group by 1 order by sum(i.total) desc nulls last limit 10`);
  const customers: NamedRow[] = (custRes.rows as Array<{ name: string; n: number; total: string | null }>).map((r) => ({
    name: r.name,
    count: r.n,
    minor: r.total === null ? null : toCents(r.total).toString(),
  }));

  const prodRes = await tx.execute(sql`
    select p.name, sum(il.quantity)::int as n, sum(il.line_total)::text as total
      from invoice_lines il
      join invoices i on i.id = il.invoice_id and i.workspace_id = il.workspace_id
      join products p on p.id = il.product_id and p.workspace_id = il.workspace_id
     where il.workspace_id = ${workspaceId}
       and (i.issued_at at time zone 'UTC')::date between ${range.from}::date and ${range.to}::date
     group by p.name order by sum(il.line_total) desc nulls last limit 10`);
  const products: NamedRow[] = (prodRes.rows as Array<{ name: string; n: number; total: string | null }>).map((r) => ({
    name: r.name,
    count: r.n,
    minor: r.total === null ? null : toCents(r.total).toString(),
  }));

  const invRes = await tx.execute(sql`
    select i.number, c.name as client, (i.issued_at at time zone 'UTC')::date::text as issued,
           i.due_date::text as due, i.status, ${range.currency}::text as currency,
           i.total::text as total, (i.total - i.paid)::text as balance
      from invoices i
      left join clients c on c.id = i.client_id and c.workspace_id = i.workspace_id
     where i.workspace_id = ${workspaceId}
       and (i.issued_at at time zone 'UTC')::date between ${range.from}::date and ${range.to}::date
     order by i.issued_at desc limit 200`);
  const invoices: InvoiceRow[] = (
    invRes.rows as Array<{ number: string; client: string | null; issued: string; due: string | null; status: string; currency: string; total: string | null; balance: string | null }>
  ).map((r) => ({
    number: r.number,
    client: r.client,
    issuedOn: r.issued,
    dueOn: r.due,
    status: r.status,
    currency: r.currency,
    totalMinor: r.total === null ? null : toCents(r.total).toString(),
    balanceMinor: r.balance === null ? null : toCents(r.balance).toString(),
  }));

  return {
    report: "revenue",
    range: { from: range.from, to: range.to, currency: range.currency },
    kpis,
    trend,
    customers,
    products,
    invoices,
  };
}

export type PnlSection = "revenue" | "cogs" | "expense" | "tax";
export type PnlAccountRow = { code: string; name: string; minor: string; section: PnlSection };

export type ProfitLoss = {
  report: "pnl";
  range: { from: string; to: string; currency: string };
  sections: PnlAccountRow[];
  totals: {
    revenueMinor: string;
    cogsMinor: string;
    grossProfitMinor: string;
    expenseMinor: string;
    netBeforeTaxMinor: string;
    taxMinor: string;
    netMinor: string;
  };
  complete: { cogs: boolean; revenue: boolean };
  notes: string[];
};

/**
 * Laba Rugi satu langkah (R17 §A4.5): Pendapatan → Total Pendapatan Bersih → HPP → Laba Kotor →
 * **Beban** (bukan “Beban/Kewajiban”, D-30) → Total Beban → Laba Sebelum Pajak → Pajak → Laba Bersih.
 * Akun diambil dinamis dari COA; tidak ada angka contoh dan tidak ada tarif pajak yang dikarang.
 */
export async function profitLoss(tx: DB, workspaceId: string, range: ReportRange): Promise<ProfitLoss> {
  const rowsRes = await tx.execute(sql`
    select a.code, a.name, a.type, a.subtype,
           sum(l.debit)::text as debit, sum(l.credit)::text as credit
      from journal_lines l
      join journal_entries e on e.id = l.entry_id and e.workspace_id = l.workspace_id
      join coa_accounts a on a.id = l.account_id and a.workspace_id = l.workspace_id
     where l.workspace_id = ${workspaceId} and e.status = 'posted'
       and e.entry_date between ${range.from}::date and ${range.to}::date
       and a.type in ('revenue', 'expense')
     group by a.code, a.name, a.type, a.subtype
     order by a.code`);

  const sections: PnlAccountRow[] = [];
  let cogsAccountCount = 0;
  for (const r of rowsRes.rows as Array<{ code: string; name: string; type: string; subtype: string | null; debit: string | null; credit: string | null }>) {
    const debit = r.debit === null ? 0n : toCents(r.debit);
    const credit = r.credit === null ? 0n : toCents(r.credit);
    let section: PnlSection;
    let net: bigint;
    if (r.type === "revenue") {
      section = "revenue";
      net = credit - debit;
    } else if (r.subtype === "cogs") {
      section = "cogs";
      net = debit - credit;
      cogsAccountCount += 1;
    } else if (r.subtype === "tax") {
      section = "tax";
      net = debit - credit;
    } else {
      section = "expense";
      net = debit - credit;
    }
    if (net === 0n) continue;
    sections.push({ code: r.code, name: r.name, minor: net.toString(), section });
  }

  const revenue = await computeMetric(tx, workspaceId, "pnl.revenue", range);
  const cogs = await computeMetric(tx, workspaceId, "pnl.cogs", range);
  const expense = await computeMetric(tx, workspaceId, "pnl.expense", range);
  const tax = await computeMetric(tx, workspaceId, "pnl.tax", range);
  const rev = revenue.minor === null ? 0n : BigInt(revenue.minor);
  const cg = cogs.minor === null ? 0n : BigInt(cogs.minor);
  const ex = expense.minor === null ? 0n : BigInt(expense.minor);
  const txMinor = tax.minor === null ? 0n : BigInt(tax.minor);
  const gross = rev - cg;
  const beforeTax = gross - ex;

  const notes: string[] = [];
  if (cogsAccountCount === 0) notes.push("HPP belum lengkap: tidak ada akun ber-subtipe cogs pada periode ini.");
  if (revenue.minor === null) notes.push("Belum ada jurnal pendapatan posted pada periode ini.");
  if (tax.minor === null) notes.push("Pajak tidak tercatat; laporan tidak mengarang tarif.");

  return {
    report: "pnl",
    range: { from: range.from, to: range.to, currency: range.currency },
    sections,
    totals: {
      revenueMinor: rev.toString(),
      cogsMinor: cg.toString(),
      grossProfitMinor: gross.toString(),
      expenseMinor: ex.toString(),
      netBeforeTaxMinor: beforeTax.toString(),
      taxMinor: txMinor.toString(),
      netMinor: (beforeTax - txMinor).toString(),
    },
    complete: { cogs: cogsAccountCount > 0, revenue: revenue.minor !== null },
    notes,
  };
}