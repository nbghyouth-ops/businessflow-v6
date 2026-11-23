"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, DataTable, Empty, ErrorBox, Loading, PageHeader, TextField, type Col } from "@/components/ui";
import { ReportExportCard } from "@/components/report-export";
import { toInputDate, useApi } from "@/lib/client";
import { basisLabel } from "@/lib/metrics/labels";
import { formatMoney, fromCents } from "@/lib/money";
import { tr } from "@/lib/tr";

type Kpi = { code: string; label: string; unit: "money" | "count"; minor: string | null; count: number | null; complete: boolean; basis: string };
type Payload = {
  range: { from: string; to: string; currency: string };
  kpis: Kpi[];
  daily: Array<{ date: string; orders: number; grossMinor: string | null }>;
  channels: Array<{ name: string; orders: number; grossMinor: string | null }>;
  orders: Array<{ orderRef: string; occurredOn: string; status: string; grossMinor: string | null; currency: string }>;
  lastImportAt: string | null;
};

const money = (minor: string | null, currency: string) => (minor === null ? "—" : formatMoney(fromCents(BigInt(minor)), currency));
const kpiText = (k: Kpi, currency: string) =>
  k.unit === "count" ? (k.count === null ? "—" : String(k.count)) : money(k.minor, currency);

/** Selisih dua metrik uang (BigInt); "—" bila salah satu belum ada. Selisih = informasi, bukan pendapatan. */
function difference(data: Payload, a: string, b: string): string {
  const av = data.kpis.find((k) => k.code === a)?.minor;
  const bv = data.kpis.find((k) => k.code === b)?.minor;
  if (av === null || av === undefined || bv === null || bv === undefined) return "—";
  return money((BigInt(av) - BigInt(bv)).toString(), data.range.currency);
}

const importLink = (
  <Link
    href="/import"
    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-action)] px-4 text-sm font-semibold text-white"
  >
    {tr("Buka Pusat Import")}
  </Link>
);

export default function MarketplacePerformancePage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(toInputDate(first));
  const [to, setTo] = useState(toInputDate(today));
  const { data, error, loading, reload } = useApi<Payload>(`/reports/marketplace-performance?from=${from}&to=${to}`);

  const dailyCols: Col[] = [
    { key: "date", label: tr("Tanggal") },
    { key: "orders", label: tr("Pesanan"), right: true },
    { key: "gross", label: tr("Nilai pesanan (sumber)"), right: true },
  ];
  const channelCols: Col[] = [
    { key: "name", label: tr("Kanal") },
    { key: "orders", label: tr("Pesanan"), right: true },
    { key: "gross", label: tr("Nilai pesanan (sumber)"), right: true },
  ];
  const orderCols: Col[] = [
    { key: "orderRef", label: tr("No. pesanan") },
    { key: "occurredOn", label: tr("Tanggal pesanan") },
    { key: "status", label: tr("Status") },
    { key: "gross", label: tr("Nilai (sumber)"), right: true },
  ];

  return (
    <>
      <PageHeader
        label={tr("Laporan")}
        title={tr("Performa Penjualan Marketplace")}
        desc={tr("Angka pesanan menurut berkas impor. Bukan pendapatan akuntansi: settlement dan mutasi bank dihitung terpisah.")}
      />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} max={to} />
          <TextField label={tr("Sampai")} type="date" value={to} onChange={setTo} min={from} />
        </div>
      </Card>
      <ReportExportCard report="marketplace" from={from} to={to} />
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
                <p className="mt-1 text-xs text-neutral-500">{tr("Basis tanggal")}: {basisLabel(k.basis)}</p>
              </Card>
            ))}
          </div>
          <Card
            className="mb-6"
            title={tr("Perbandingan sumber (tidak dijumlahkan)")}
            desc={tr("Pesanan, settlement, dan pencairan bank adalah basis berbeda. Selisih di bawah adalah informasi, bukan pendapatan.")}
          >
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                ["marketplace.gross_amount", tr("Nilai pesanan (sumber)")],
                ["marketplace.settlement_reported", tr("Settlement dilaporkan")],
                ["marketplace.bank_matched", tr("Pencairan matched bank")],
              ].map(([code, label]) => {
                const k = data.kpis.find((x) => x.code === code);
                return (
                  <div key={code} className="rounded-xl border border-line p-3">
                    <dt className="text-xs text-ink-2">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {k && k.complete ? kpiText(k, data.range.currency) : tr("Belum ada data")}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <div className="mt-3 space-y-1 text-xs text-ink-2">
              <p>
                {tr("Selisih pesanan − settlement dilaporkan")}:{" "}
                <span className="tabular-nums">{difference(data, "marketplace.gross_amount", "marketplace.settlement_reported")}</span>
              </p>
              <p>
                {tr("Selisih settlement − pencairan matched")}:{" "}
                <span className="tabular-nums">{difference(data, "marketplace.settlement_reported", "marketplace.bank_matched")}</span>
              </p>
            </div>
          </Card>
          <Card className="mb-6" title={tr("Rekap harian")}>
            <DataTable
              rows={data.daily.map((d) => ({ ...d, gross: money(d.grossMinor, data.range.currency) }))}
              columns={dailyCols}
              caption={tr("Rekap harian nilai pesanan menurut sumber")}
              empty={<Empty title={tr("Data belum cukup")} hint={tr("Unggah laporan pesanan di Pusat Import.")} action={importLink} />}
            />
          </Card>
          <Card className="mb-6" title={tr("Per kanal/toko")}>
            <DataTable
              rows={data.channels.map((c) => ({ ...c, gross: money(c.grossMinor, data.range.currency) }))}
              columns={channelCols}
              caption={tr("Rekap per kanal")}
              empty={<Empty title={tr("Belum ada data kanal")} />}
            />
          </Card>
          <Card title={tr("Daftar pesanan")}>
            <DataTable
              rows={data.orders.map((o) => ({ ...o, gross: money(o.grossMinor, o.currency) }))}
              columns={orderCols}
              caption={tr("Pesanan pada periode")}
              empty={<Empty title={tr("Belum ada pesanan pada periode ini")} />}
            />
          </Card>
          <p className="mt-4 text-xs text-neutral-500">
            {tr("Berdasarkan berkas impor sampai")}: {data.lastImportAt ?? tr("belum ada impor")}
          </p>
        </>
      )}
    </>
  );
}