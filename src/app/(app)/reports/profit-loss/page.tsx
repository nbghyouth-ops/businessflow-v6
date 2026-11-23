"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, DataTable, Empty, ErrorBox, Loading, PageHeader, TextField, type Col } from "@/components/ui";
import { ReportExportCard } from "@/components/report-export";
import { toInputDate, useApi } from "@/lib/client";
import { formatMoney, fromCents } from "@/lib/money";
import { tr } from "@/lib/tr";

type AccountRow = { code: string; name: string; minor: string; section: "revenue" | "cogs" | "expense" | "tax" };
type Payload = {
  range: { from: string; to: string; currency: string };
  sections: AccountRow[];
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

const money = (minor: string, currency: string) => formatMoney(fromCents(BigInt(minor)), currency);

const importLink = (
  <Link
    href="/import"
    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-action)] px-4 text-sm font-semibold text-white"
  >
    {tr("Buka Pusat Import")}
  </Link>
);

export default function ProfitLossPage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(toInputDate(first));
  const [to, setTo] = useState(toInputDate(today));
  const { data, error, loading, reload } = useApi<Payload>(`/reports/profit-loss-detail?from=${from}&to=${to}`);

  const cols: Col[] = [
    { key: "code", label: tr("Kode") },
    { key: "name", label: tr("Akun") },
    // Kolom ini UANG, bukan kuantitas: "Jumlah" di kamus berarti "Quantity" (dipakai di laporan lain).
    { key: "amount", label: tr("Jumlah (uang)"), right: true },
  ];
  const section = (key: AccountRow["section"]) =>
    (data?.sections ?? []).filter((s) => s.section === key).map((s) => ({ ...s, amount: money(s.minor, data!.range.currency) }));

  const line = (label: string, minor: string, emphasis = false) => (
    <div className={`flex items-baseline justify-between border-t border-neutral-200 py-2 ${emphasis ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{money(minor, data!.range.currency)}</span>
    </div>
  );

  return (
    <>
      <PageHeader
        label={tr("Laporan")}
        title={tr("Laba Rugi")}
        desc={tr("Satu langkah dari jurnal posted. Beban bukan kewajiban; pajak hanya yang tercatat.")}
      />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} max={to} />
          <TextField label={tr("Sampai")} type="date" value={to} onChange={setTo} min={from} />
        </div>
      </Card>
      <ReportExportCard report="pnl" from={from} to={to} />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : !data ? null : (
        <>
          <Card className="mb-6" title={tr("Pendapatan")}>
            <DataTable rows={section("revenue")} columns={cols} caption={tr("Akun pendapatan")} empty={<Empty title={tr("Data belum cukup")} hint={tr("Belum ada jurnal pendapatan posted.")} action={importLink} />} />
            {line(tr("Total Pendapatan Bersih"), data.totals.revenueMinor, true)}
          </Card>
          <Card className="mb-6" title={tr("Harga Pokok Penjualan (HPP)")}>
            <DataTable rows={section("cogs")} columns={cols} caption={tr("Akun HPP")} empty={<Empty title={tr("HPP belum lengkap")} hint={tr("Tandai akun HPP dengan subtipe cogs.")} />} />
            {line(tr("Total HPP"), data.totals.cogsMinor)}
            {line(tr("Laba Kotor"), data.totals.grossProfitMinor, true)}
          </Card>
          <Card className="mb-6" title={tr("Beban")}>
            <DataTable rows={section("expense")} columns={cols} caption={tr("Akun beban")} empty={<Empty title={tr("Belum ada beban posted")} />} />
            {line(tr("Total Beban"), data.totals.expenseMinor)}
          </Card>
          <Card className="mb-6" title={tr("Pajak")}>
            <DataTable rows={section("tax")} columns={cols} caption={tr("Akun pajak")} empty={<Empty title={tr("Pajak tidak tercatat")} />} />
            {line(tr("Total Pajak"), data.totals.taxMinor)}
          </Card>
          <Card title={tr("Ringkasan")}>
            {line(tr("Laba Sebelum Pajak"), data.totals.netBeforeTaxMinor, true)}
            {line(tr("Laba/Rugi Bersih"), data.totals.netMinor, true)}
            {data.notes.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-xs text-neutral-600">
                {data.notes.map((n) => (
                  <li key={n}>{tr(n)}</li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}