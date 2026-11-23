"use client";
 
import { tr } from "@/lib/tr";
import { useState } from "react";
import { useBiz } from "@/components/shell";
import { Button, Card, DataTable, Empty, ErrorBox, Loading, PageHeader, SelectField, TextField, type Col } from "@/components/ui";
import { downloadCsv, toInputDate, useApi } from "@/lib/client";
import { downloadTableExcel } from "@/lib/excel-export";
import { formatMoney } from "@/lib/money";

const REPORTS = [
  ["trial-balance", "Neraca Saldo", "finance:read"], ["profit-loss", "Laba Rugi", "finance:read"], ["balance-sheet", "Neraca", "finance:read"], ["cash-flow", "Arus Kas", "finance:read"], ["ledger", "Buku Besar", "finance:read"],
  ["sales-daily", "Penjualan Harian", "sales:read"], ["sales-products", "Penjualan per Produk", "sales:read"], ["inventory-valuation", "Nilai Persediaan", "inventory:read"], ["client-summary", "Ringkasan Keuangan Klien", "crm:read"],
] as const;
const MONEY_KEYS = new Set(["debit", "credit", "amount", "balance", "inflow", "outflow", "net", "total", "paid", "tax", "revenue", "cost", "value", "avgCost", "billed", "outstanding"]);

export default function Reports() {
  const biz = useBiz();
  const avail = REPORTS.filter((r) => biz.can(r[2] as any));
  const d = new Date(); const f0 = new Date(d.getFullYear(), d.getMonth(), 1);
  const [name, setName] = useState<string>(avail[0]?.[0] ?? "");
  const [from, setFrom] = useState(toInputDate(f0)); const [to, setTo] = useState(toInputDate(d)); const [acc, setAcc] = useState("");
  const coa = useApi<any>(name === "ledger" ? "/finance/coa" : null);
  const path = name && (name !== "ledger" || acc) ? `/reports/${name}?from=${from}&to=${to}${acc ? `&accountId=${acc}` : ""}` : null;
  const { data, error, loading, reload } = useApi<any>(path);

  const cols: Col[] = (data?.columns ?? []).map((c: any) => ({ key: c.key, label: c.label, right: c.align === "right", render: (r: any) => MONEY_KEYS.has(c.key) && r[c.key] !== "" && r[c.key] !== undefined ? formatMoney(r[c.key], biz.currency) : (r[c.key] ?? "") }));
  if (!avail.length) return <Empty title={tr("Tidak ada laporan untuk peran perangkat ini")} />;
  return (
    <>
      <PageHeader label={tr("Reports")} title={tr("Laporan & Analitik")} desc={tr("Semua angka bersumber dari jurnal dan transaksi sah. Ekspor tersedia dalam CSV dan Excel (.xlsx) dengan format rapi.")}
        actions={data && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => downloadCsv(`${name}-${from}_${to}.csv`, data.columns, data.rows)}>{tr("Ekspor CSV")}</Button>
            <Button onClick={() => void downloadTableExcel(data.title, `${name}-${from}_${to}.xlsx`, data.columns.map((c: any) => c.label), data.rows.map((r: any) => data.columns.map((c: any) => MONEY_KEYS.has(c.key) && r[c.key] !== "" && r[c.key] !== undefined ? Number(r[c.key]) : (r[c.key] ?? ""))), biz.currency)}>{tr("Unduh Excel (.xlsx)")}</Button>
          </div>
        )} />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label={tr("Laporan")} value={name} onChange={setName} options={avail.map((r) => ({ value: r[0], label: r[1] }))} />
          <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} max={to} /><TextField label={tr("Sampai / per tanggal")} type="date" value={to} onChange={setTo} min={from} />
          {name === "ledger" && <SelectField label={tr("Akun")} value={acc} onChange={setAcc} placeholder={tr("Pilih akun")} options={(coa.data?.items ?? []).map((a: any) => ({ value: a.id, label: `${a.code} ${a.name}` }))} />}
        </div>
      </Card>
      {!path ? <Empty title={tr("Pilih akun untuk menampilkan buku besar")} /> : error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : data && (
        <Card title={data.title} desc={data.description}><DataTable rows={data.rows} columns={cols} caption={data.title} empty={<Empty title={tr("Tidak ada data pada rentang ini")} hint={tr("Ubah rentang tanggal atau catat transaksi terlebih dahulu.")} />} /></Card>)}
    </>
  );
}
