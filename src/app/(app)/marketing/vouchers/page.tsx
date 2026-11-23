"use client";

import { useState } from "react";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, PageHeader, SelectField, TextField } from "@/components/ui";
import { api, toast, toInputDate, useApi } from "@/lib/client";
import { tr } from "@/lib/tr";

type Voucher = {
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

const today = () => toInputDate();
const in30 = () => toInputDate(new Date(Date.now() + 30 * 86_400_000));

/**
 * Voucher/loyalitas (R11-E) — CATATAN DISKON pada penjualan yang dicatat.
 * Tidak ada pembayaran, tidak ada penyambungan ke marketplace, dan tidak mengubah invoice
 * secara diam-diam: pemakaian dicatat sebagai jejak dengan nilai diskon eksak.
 */
export default function VouchersPage() {
  const { data, error, loading, reload } = useApi<{ items: Voucher[] }>("/v6/vouchers");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [percent, setPercent] = useState("10");
  const [amount, setAmount] = useState("");
  const [minPurchase, setMinPurchase] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [validFrom, setValidFrom] = useState(today());
  const [validTo, setValidTo] = useState(in30());
  const [quota, setQuota] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/v6/vouchers", {
        body: {
          code,
          kind,
          percentBp: kind === "percent" ? Math.round(Number(percent) * 100) : null,
          amount: kind === "amount" ? amount : null,
          minPurchase: minPurchase || "0",
          maxDiscount: maxDiscount || null,
          validFrom,
          validTo,
          quota: quota ? Number(quota) : null,
        },
      });
      setCode("");
      toast(tr("Voucher dicatat"));
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        label={tr("Pemasaran")}
        title={tr("Voucher & Loyalitas")}
        desc={tr("Catatan diskon untuk penjualan yang Anda catat. Bukan alat pembayaran dan tidak memotong uang siapa pun.")}
      />
      <Card className="mb-6" title={tr("Buat voucher")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label={tr("Kode voucher")} value={code} onChange={(v) => setCode(v.toUpperCase())} />
          <SelectField
            label={tr("Jenis diskon")}
            value={kind}
            onChange={(v) => setKind(v as "percent" | "amount")}
            options={[
              { value: "percent", label: tr("Persen (%)") },
              { value: "amount", label: tr("Nominal") },
            ]}
          />
          {kind === "percent" ? (
            <TextField label={tr("Persen (%)")} value={percent} onChange={setPercent} />
          ) : (
            <TextField label={tr("Nominal diskon")} value={amount} onChange={setAmount} />
          )}
          <TextField label={tr("Minimum belanja")} value={minPurchase} onChange={setMinPurchase} />
          <TextField label={tr("Batas maksimum diskon (opsional)")} value={maxDiscount} onChange={setMaxDiscount} />
          <TextField label={tr("Kuota pemakaian (opsional)")} value={quota} onChange={setQuota} />
          <TextField label={tr("Berlaku dari")} type="date" value={validFrom} onChange={setValidFrom} />
          <TextField label={tr("Berlaku sampai")} type="date" value={validTo} onChange={setValidTo} />
        </div>
        <div className="mt-3">
          <Button loading={busy} disabled={code.trim().length < 2} onClick={() => void save()}>
            {tr("Simpan voucher")}
          </Button>
        </div>
      </Card>
      <Card title={tr("Daftar voucher")}>
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={data?.items ?? []}
            caption={tr("Voucher workspace ini")}
            empty={<Empty title={tr("Belum ada voucher")} hint={tr("Voucher hanya berguna bila benar-benar Anda pakai.")} />}
            columns={[
              { key: "code", label: tr("Kode") },
              {
                key: "value",
                label: tr("Nilai"),
                render: (v: Voucher) => (v.kind === "percent" ? `${((v.percentBp ?? 0) / 100).toFixed(2)}%` : `${v.amount} ${v.currency}`),
              },
              { key: "minPurchase", label: tr("Minimum belanja"), right: true },
              { key: "period", label: tr("Periode"), render: (v: Voucher) => `${v.validFrom} → ${v.validTo}` },
              { key: "used", label: tr("Terpakai"), right: true, render: (v: Voucher) => `${v.used}${v.quota ? ` / ${v.quota}` : ""}` },
              { key: "status", label: tr("Status"), render: (v: Voucher) => <Badge tone={v.isActive ? "success" : "neutral"}>{v.isActive ? tr("Aktif") : tr("Nonaktif")}</Badge> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
