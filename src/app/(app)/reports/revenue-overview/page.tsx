"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, DataTable, Empty, ErrorBox, Loading, PageHeader, TextField, type Col } from "@/components/ui";
import { ReportExportCard } from "@/components/report-export";
import { toInputDate, useApi } from "@/lib/client";
import { sourceLabel } from "@/lib/metrics/labels";
import { formatMoney, fromCents } from "@/lib/money";
import { tr } from "@/lib/tr";

type Kpi = { code: string; label: string; unit: "money" | "count"; minor: string | null; count: number | null; complete: boolean; basis: string };
type Payload = {
  range: { from: string; to: string; currency: string };
  kpis: Kpi[];
  trend: Array<{ bucket: string; revenueMinor: string; expenseMinor: string }>;
  customers: Array<{ name: string; count: number; minor: string | null }>;
  products: Array<{ name: string; count: number; minor: string | null }>;
  invoices: Array<{ number: string; client: string | null; issuedOn: string; dueOn: string | null; status: string; currency: string; totalMinor: string | null; balanceMinor: string | null }>;
};

const money = (minor: string | null, currency: string) => (minor === null ? "—" : formatMoney(fromCents(BigInt(minor)), currency));
const kpiText = (k: Kpi, currency: string) => (k.unit === "count" ? (k.count === null ? "—" : String(k.count)) : money(k.minor, currency));

const importLink = (
  <Link
    href="/import"
    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-action)] px-4 text-sm font-semibold text-white"
  >
    {tr("Buka Pusat Import")}
  </Link>
);

export default function RevenueOverviewPage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(toInputDate(first));
  const [to, setTo] = useState(toInputDate(today));
  const { data, error, loading, reload } = useApi<Payload>(`/reports/revenue-overview?from=${from}&to=${to}`);

  const trendCols: Col[] = [
    { key: "bucket", label: tr("Bulan") },
    { key: "revenue", label: tr("Pendapatan posted"), right: true },
    { key: "expense", label: tr("Beban posted"), right: true },
  ];
  const namedCols = (label: string): Col[] => [
    { key: "name", label },
    { key: "count", label: tr("Jumlah"), right: true },
    { key: "total", label: tr("Nilai"), right: true },
  ];
  const invoiceCols: Col[] = [
    { key: "number", label: tr("Nomor dokumen") },
    { key: "client", label: tr("Pelanggan") },
    { key: "issuedOn", label: tr("Tanggal invoice") },
    { key: "dueOn", label: tr("Jatuh tempo") },
    { key: "status", label: tr("Status") },
    { key: "total", label: tr("Nilai"), right: true },
    { key: "balance", label: tr("Sisa"), right: true },
  ];

  return (
    <>
      <PageHeader
        label={tr("Laporan")}
        title={tr("Revenue Overview")}
        desc={tr("Pendapatan dari jurnal posted dan invoice. Tidak mencampur nilai pesanan marketplace atau settlement.")}
      />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} max={to} />
          <TextField label={tr("Sampai")} type="date" value={to} onChange={setTo} min={from} />
        </div>
      </Card>
      <ReportExportCard report="revenue" from={from} to={to} />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : !data ? null : (
        <>
          {/* Grid KPI kolom tetap 5/3/2/1 (spesifikasi R11-C §2.2.5). */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {data.kpis.map((k) => (
              <Card key={k.code} title={tr(k.label)}>
                <p className="text-2xl font-semibold tabular-nums">{k.complete ? kpiText(k, data.range.currency) : tr("Belum ada data")}</p>
                <p className="mt-1 text-xs text-neutral-500">{tr("Sumber")}: {sourceLabel(k.basis)}</p>
              </Card>
            ))}
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card title={tr("Pendapatan & beban per bulan")}>
              <DataTable
                rows={data.trend.map((t) => ({ bucket: t.bucket, revenue: money(t.revenueMinor, data.range.currency), expense: money(t.expenseMinor, data.range.currency) }))}
                columns={trendCols}
                caption={tr("Tren pendapatan dan beban")}
                empty={<Empty title={tr("Data belum cukup")} hint={tr("Catat transaksi atau jurnal posted terlebih dahulu.")} action={importLink} />}
              />
            </Card>
            <Card title={tr("Pelanggan teratas")}>
              <DataTable
                rows={data.customers.map((c) => ({ ...c, total: money(c.minor, data.range.currency) }))}
                columns={namedCols(tr("Pelanggan"))}
                caption={tr("Pelanggan menurut nilai invoice")}
                empty={<Empty title={tr("Belum ada invoice")} />}
              />
            </Card>
          </div>
          <Card className="mb-6" title={tr("Produk teratas")}>
            <DataTable
              rows={data.products.map((p) => ({ ...p, total: money(p.minor, data.range.currency) }))}
              columns={namedCols(tr("Produk"))}
              caption={tr("Produk menurut nilai baris invoice")}
              empty={<Empty title={tr("Belum ada baris invoice")} />}
            />
          </Card>
          <Card title={tr("Register invoice")}>
            <DataTable
              rows={data.invoices.map((i) => ({ ...i, total: money(i.totalMinor, i.currency), balance: money(i.balanceMinor, i.currency) }))}
              columns={invoiceCols}
              caption={tr("Register invoice pada periode")}
              empty={<Empty title={tr("Belum ada invoice pada periode ini")} hint={tr("Catat invoice atau unggah laporan di Pusat Import.")} action={importLink} />}
            />
          </Card>
        </>
      )}
    </>
  );
}