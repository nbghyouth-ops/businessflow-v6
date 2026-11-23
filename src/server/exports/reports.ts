/**
 * Data ekspor laporan (R11-D §T5) — server-side, memakai lapisan metrik yang sama
 * dengan UI (`src/lib/metrics`) agar angka laporan dan angka ekspor tidak menyimpang.
 *
 * Semua uang dikonversi ke TEKS desimal eksak (`minorToDecimal`); tidak ada float.
 * Baris belum terbit (`published_at is null`) tidak diekspor.
 */
import { sql } from "drizzle-orm";
import type { DB } from "@/server/core";
import { profitLoss } from "@/lib/metrics";
import { minorToDecimal, moneyText } from "@/features/exports/precision";
import {
  ExportTooLargeError,
  EXPORT_ROW_LIMIT,
  sheetById,
  totalRows,
  type ExportRow,
  type SheetId,
  type SheetPart,
} from "@/features/exports/spec";

export type ReportExportRequest = {
  report: SheetId | "all";
  from: string;
  to: string;
  currency: string;
};

const SHEET_ORDER: SheetId[] = ["marketplace", "revenue", "pnl", "bank", "settlement"];

async function marketplaceRows(tx: DB, ws: string, from: string, to: string, currency: string): Promise<ExportRow[]> {
  const res = await tx.execute(sql`
    select o.order_no, o.occurred_on::text as occurred_on,
           coalesce(c.name, '') as channel, o.status,
           o.gross_amount::text as gross, o.platform_fee::text as fee, o.net_amount::text as net,
           coalesce(o.currency, ${currency}) as currency
      from marketplace_orders o
      left join marketplace_channels c on c.id = o.channel_id and c.workspace_id = o.workspace_id
     where o.workspace_id = ${ws} and o.published_at is not null
       and o.occurred_on between ${from}::date and ${to}::date
     order by o.occurred_on, o.order_no`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    orderNo: String(r.order_no ?? ""),
    occurredOn: String(r.occurred_on ?? ""),
    channel: String(r.channel ?? ""),
    status: String(r.status ?? ""),
    gross: moneyText(r.gross, String(r.currency ?? currency)),
    platformFee: moneyText(r.fee, String(r.currency ?? currency)),
    net: moneyText(r.net, String(r.currency ?? currency)),
    currency: String(r.currency ?? currency),
  }));
}

async function revenueRows(tx: DB, ws: string, from: string, to: string, currency: string): Promise<ExportRow[]> {
  const res = await tx.execute(sql`
    select i.number, (i.issued_at at time zone 'UTC')::date::text as issued_on,
           coalesce(c.name, '') as client, i.status,
           i.total::text as total, i.paid::text as paid, (i.total - i.paid)::text as balance
      from invoices i
      left join clients c on c.id = i.client_id and c.workspace_id = i.workspace_id
     where i.workspace_id = ${ws}
       and (i.issued_at at time zone 'UTC')::date between ${from}::date and ${to}::date
     order by i.issued_at, i.number`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    number: String(r.number ?? ""),
    issuedOn: String(r.issued_on ?? ""),
    client: String(r.client ?? ""),
    status: String(r.status ?? ""),
    total: moneyText(r.total, currency),
    paid: moneyText(r.paid, currency),
    balance: moneyText(r.balance, currency),
    currency,
  }));
}

/**
 * Lembar P&L memakai `profitLoss()` — satu sumber dengan halaman laporan.
 * Baris total ditambahkan agar sama dengan struktur laporan (band & subtotal).
 */
async function pnlRows(tx: DB, ws: string, from: string, to: string, currency: string): Promise<ExportRow[]> {
  const report = await profitLoss(tx, ws, { from, to, currency });
  const rows: ExportRow[] = report.sections.map((s) => ({
    section: s.section,
    code: s.code,
    name: s.name,
    amount: minorToDecimalSafe(s.minor, currency),
    currency,
  }));
  const totals: Array<[string, string, string]> = [
    ["revenue", "TOTAL", "Total Pendapatan Bersih"],
    ["cogs", "TOTAL", "Total HPP"],
    ["gross", "TOTAL", "Laba Kotor"],
    ["expense", "TOTAL", "Total Beban"],
    ["tax", "TOTAL", "Total Pajak"],
    ["net", "TOTAL", "Laba/Rugi Bersih"],
  ];
  const map: Record<string, string> = {
    revenue: report.totals.revenueMinor,
    cogs: report.totals.cogsMinor,
    gross: report.totals.grossProfitMinor,
    expense: report.totals.expenseMinor,
    tax: report.totals.taxMinor,
    net: report.totals.netMinor,
  };
  for (const [key, code, name] of totals) {
    rows.push({ section: key, code, name, amount: minorToDecimalSafe(map[key], currency), currency });
  }
  return rows;
}

function minorToDecimalSafe(minor: string, currency: string): string {
  return minorToDecimal(BigInt(minor), currency);
}

async function bankRows(tx: DB, ws: string, from: string, to: string, currency: string): Promise<ExportRow[]> {
  const res = await tx.execute(sql`
    select coalesce(b.transaction_on, b.posted_on)::text as date, coalesce(b.description, '') as description,
           b.direction, b.amount::text as amount,
           case when exists (
             select 1 from bank_reconciliation_matches m
              where m.workspace_id = ${ws} and m.status = 'confirmed'
                and (m.left_id = b.id or m.right_id = b.id)
           ) then 'matched' else 'unmatched' end as matched,
           coalesce(b.external_transaction_ref, '') as reference,
           coalesce(b.currency, ${currency}) as currency
      from bank_statement_lines b
     where b.workspace_id = ${ws} and b.published_at is not null
       and coalesce(b.transaction_on, b.posted_on) between ${from}::date and ${to}::date
     order by coalesce(b.transaction_on, b.posted_on), b.seq`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    date: String(r.date ?? ""),
    description: String(r.description ?? ""),
    direction: String(r.direction ?? ""),
    amount: moneyText(r.amount, String(r.currency ?? currency)),
    matched: String(r.matched ?? ""),
    reference: String(r.reference ?? ""),
    currency: String(r.currency ?? currency),
  }));
}

async function settlementRows(tx: DB, ws: string, from: string, to: string, currency: string): Promise<ExportRow[]> {
  const res = await tx.execute(sql`
    select s.statement_on::text as statement_on, coalesce(c.name, '') as channel,
           s.settlement_total::text as settlement_total, s.fee_total::text as fee_total,
           s.adjustment_total::text as adjustment_total,
           coalesce(s.currency, ${currency}) as currency
      from marketplace_settlement_summaries s
      left join marketplace_channels c on c.id = s.channel_id and c.workspace_id = s.workspace_id
     where s.workspace_id = ${ws} and s.published_at is not null
       and s.statement_on between ${from}::date and ${to}::date
     order by s.statement_on, s.statement_reference`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    statementOn: String(r.statement_on ?? ""),
    channel: String(r.channel ?? ""),
    settlementTotal: moneyText(r.settlement_total, String(r.currency ?? currency)),
    feeTotal: moneyText(r.fee_total, String(r.currency ?? currency)),
    adjustmentTotal: moneyText(r.adjustment_total, String(r.currency ?? currency)),
    currency: String(r.currency ?? currency),
  }));
}

/** Susun lembar yang diminta; menolak bila total baris melebihi batas sinkron. */
export async function buildReportParts(tx: DB, ws: string, req: ReportExportRequest): Promise<SheetPart[]> {
  const wanted: SheetId[] = req.report === "all" ? SHEET_ORDER : [req.report];
  const parts: SheetPart[] = [];
  for (const id of wanted) {
    const spec = sheetById(id);
    const rows =
      id === "marketplace"
        ? await marketplaceRows(tx, ws, req.from, req.to, req.currency)
        : id === "revenue"
          ? await revenueRows(tx, ws, req.from, req.to, req.currency)
          : id === "pnl"
            ? await pnlRows(tx, ws, req.from, req.to, req.currency)
            : id === "bank"
              ? await bankRows(tx, ws, req.from, req.to, req.currency)
              : await settlementRows(tx, ws, req.from, req.to, req.currency);
    parts.push({ spec, rows });
  }
  const rows = totalRows(parts);
  if (rows > EXPORT_ROW_LIMIT) throw new ExportTooLargeError(rows);
  return parts;
}

export { EXPORT_ROW_LIMIT };
