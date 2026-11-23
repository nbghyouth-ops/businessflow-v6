"use client";
 
import { tr } from "@/lib/tr";
import { useState } from "react";
import { ReceiptExportModal } from "@/components/export-modal";
import { downloadFinanceTemplateExcel } from "@/lib/excel-export";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, toast, toInputDate, useApi } from "@/lib/client";
import {
  downloadActivityFile,
  downloadReceiptFile,
  fmtCentsDisplay,
  fmtLocalDateTime,
  type TemplateOverrides,
} from "@/lib/export-render";
import type { ActivitySnapshot, ReceiptSnapshot } from "@/server/routes/exports";

const REPORT_PRESETS = [
  { value: "executive", label: tr("Executive") },
  { value: "complete", label: tr("Complete") },
  { value: "daily", label: tr("Daily") },
  { value: "monthly", label: tr("Monthly") },
  { value: "pos_cashier", label: tr("POS / Cashier") },
  { value: "finance", label: tr("Finance") },
  { value: "branch", label: tr("Branch") },
  { value: "custom", label: tr("Custom") },
];

export default function ExportCenterPage() {
  const [tab, setTab] = useState("activity");
  const [clientId] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("clientId") ?? "" : "",
  );
  const clientApi = useApi<any>(clientId ? `/crm/clients/${clientId}` : null);
  return (
    <>
      <PageHeader
        label={tr("Reports")}
        title={tr("Export & Activity Center")}
        desc={tr("Buat, pratinjau, dan unduh Struk Penjualan (PDF/JPG/PNG) serta Business Activity Summary (PDF/JPG/PNG/XLSX/CSV) dari data nyata.")}
      />
      {clientId && clientApi.data?.client && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-2.5 text-sm shadow-card">
          <span>
            Konteks klien aktif: <strong className="text-ink">{clientApi.data.client.name}</strong> ({clientApi.data.client.code})
          </span>
          <Badge tone="info">{tr("Dari CRM")}</Badge>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "activity", label: tr("Ringkasan Aktivitas") },
          { key: "receipts", label: tr("Struk Penjualan") },
          { key: "templates", label: tr("Template & Editor") },
          { key: "history", label: tr("Riwayat Download") },
          { key: "verify", label: tr("Cek Kode Verifikasi") },
        ]}
      />
      <div className="mt-5">
        {tab === "activity" && <ActivityExportTab />}
        {tab === "receipts" && <ReceiptsTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "verify" && <VerifyCodeTab />}
      </div>
    </>
  );
}

function ActivityExportTab() {
  const biz = useBiz();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate());
  const [preset, setPreset] = useState("executive");
  const [format, setFormat] = useState<"pdf" | "jpg" | "png" | "xlsx" | "csv">("pdf");
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<ActivitySnapshot | null>(null);

  async function generate(download: boolean) {
    setBusy(true);
    try {
      const res = await api<{ id: string; snapshot: ActivitySnapshot; templateConfig: TemplateOverrides }>("/exports/activity", {
        body: { from, to, format, templatePreset: preset, download },
      });
      setSnap(res.snapshot);
      if (download) {
        try {
          await downloadActivityFile(res.snapshot, format, preset, res.templateConfig);
        } catch (err) {
          await api(`/exports/${res.id}/fail`, { body: { error: (err as Error).message.slice(0, 250) } }).catch(() => {});
          throw err;
        }
        await api(`/exports/${res.id}/complete`, { body: {} }).catch(() => {});
        toast(`Ringkasan aktivitas diunduh (${format.toUpperCase()})`);
      } else {
        toast(tr("Pratinjau diperbarui dari snapshot server"));
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card title={tr("Parameter Ekspor")}>
        <div className="grid gap-3">
          <TextField label={tr("Dari tanggal")} type="date" value={from} onChange={setFrom} />
          <TextField label={tr("Sampai tanggal")} type="date" value={to} onChange={setTo} />
          <SelectField label={tr("Template laporan")} value={preset} onChange={setPreset} options={REPORT_PRESETS} />
          <SelectField
            label={tr("Format berkas")}
            value={format}
            onChange={(v) => setFormat(v as any)}
            options={[
              { value: "pdf", label: tr("PDF") },
              { value: "xlsx", label: tr("Excel (.xlsx)") },
              { value: "csv", label: tr("CSV") },
              { value: "png", label: tr("PNG (Gambar)") },
              { value: "jpg", label: tr("JPG (Gambar)") },
            ]}
          />
          {biz.can("export:create") && (
            <div className="grid gap-2 pt-2">
              <Button variant="secondary" loading={busy} onClick={() => void generate(false)}>
                Pratinjau Snapshot
              </Button>
              <Button loading={busy} onClick={() => void generate(true)}>
                Unduh ({format.toUpperCase()})
              </Button>
              <Button variant="secondary" onClick={() => void downloadFinanceTemplateExcel(biz.business.name, biz.currency)}>
                Template Excel Keuangan (.xlsx)
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card title={tr("Pratinjau Business Activity Summary")}>
        {!snap ? (
          <Empty title={tr("Belum ada pratinjau")} hint={tr("Klik 'Pratinjau Snapshot' atau 'Unduh' untuk menghitung rangkuman periode dari database.")} />
        ) : (
          <article aria-label={tr("Pratinjau Business Activity Summary")} className="rounded-2xl border border-line bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary-deep">{tr("BUSINESS FLOW REPORT")}</p>
                <h2 className="mt-1 text-2xl font-bold text-ink">{tr("Business Activity Summary")}</h2>
                <p className="text-sm text-ink-2">
                  {snap.businessName} · {snap.from} s.d. {snap.to}
                </p>
              </div>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-bg font-bold text-primary-deep">
                KPI
              </div>
            </div>
            <hr className="my-4 border-line" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs font-semibold text-ink-2">{tr("Total aktivitas")}</p>
                <p className="tnum mt-1 text-2xl font-bold text-ink">{snap.kpis.totalActivities}</p>
              </div>
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs font-semibold text-ink-2">{tr("Total penjualan")}</p>
                <p className="tnum mt-1 text-2xl font-bold text-ink">{fmtCentsDisplay(snap.kpis.totalSalesCents, snap.currency)}</p>
              </div>
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs font-semibold text-ink-2">{tr("Total pemasukan")}</p>
                <p className="tnum mt-1 text-2xl font-bold text-ink">{fmtCentsDisplay(snap.kpis.totalIncomeCents, snap.currency)}</p>
              </div>
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs font-semibold text-ink-2">{tr("Total pengeluaran")}</p>
                <p className="tnum mt-1 text-2xl font-bold text-ink">{fmtCentsDisplay(snap.kpis.totalExpenseCents, snap.currency)}</p>
              </div>
            </div>
            <h3 className="mt-6 text-base font-bold text-ink">{tr("Ringkasan per modul")}</h3>
            <ul className="mt-2 divide-y divide-divider">
              {snap.modules.map((m) => (
                <li key={m.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="font-semibold text-ink">{m.label}</span>
                  <span className={m.hasActivity ? "font-bold text-primary-deep" : "text-ink-2"}>{m.summary}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl bg-primary-bg p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-deep">{tr("Kesimpulan aktivitas periode")}</p>
              <p className="mt-1 text-sm text-ink">{snap.conclusion}</p>
            </div>
            <p className="mt-4 text-xs text-ink-2">
              {fmtLocalDateTime(snap.generatedAt, snap.timezone)} · Cabang: {snap.branchName} · Pembuat: {snap.operator} · {snap.reportNumber} · Kode: {snap.verificationCode}
            </p>
          </article>
        )}
      </Card>
    </div>
  );
}

function ReceiptsTab() {
  const { data, error, loading, reload } = useApi<any>("/sales/invoices");
  const [selected, setSelected] = useState<{ id: string; number: string } | null>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <Loading />;
  const rows: any[] = data?.items ?? [];
  return (
    <>
      <Card title={tr("Struk Penjualan dari Transaksi Nyata")}>
        <DataTable
          rows={rows}
          caption={tr("Daftar faktur untuk unduh struk")}
          empty={tr("Belum ada transaksi penjualan.")}
          columns={[
            { key: "number", label: tr("No. Transaksi") },
            { key: "issuedAt", label: tr("Tanggal"), render: (r: any) => fmtDateTime(r.issuedAt) },
            { key: "clientName", label: tr("Klien"), render: (r: any) => r.clientName ?? "Umum" },
            { key: "total", label: tr("Total"), right: true },
            { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
            {
              key: "a",
              label: "",
              render: (r: any) => (
                <Button variant="secondary" className="!min-h-[34px] !px-3 text-xs" onClick={() => setSelected({ id: r.id, number: r.number })}>
                  Unduh Struk
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <ReceiptExportModal
        invoiceId={selected?.id ?? null}
        invoiceNumber={selected?.number}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function TemplatesTab() {
  const { data, error, loading, reload } = useApi<any>("/exports/templates/list");
  const [kind, setKind] = useState<"receipt" | "report">("receipt");
  const [name, setName] = useState("Template Standar");
  const [preset, setPreset] = useState("80mm");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [closingText, setClosingText] = useState("Terima kasih telah berbelanja");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ id: string; version: number }>("/exports/templates", {
        body: {
          kind,
          name,
          preset,
          config: {
            businessName: businessName || undefined,
            address: address || undefined,
            contact: contact || undefined,
            closingText: closingText || undefined,
          },
        },
      });
      toast(`Template disimpan (versi ${res.version})`);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <Loading />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={tr("Editor Template (Berversi)")}>
        <div className="grid gap-3">
          <SelectField
            label={tr("Jenis template")}
            value={kind}
            onChange={(v) => {
              const k = v as "receipt" | "report";
              setKind(k);
              setPreset(k === "receipt" ? "80mm" : "executive");
            }}
            options={[
              { value: "receipt", label: tr("Template Struk") },
              { value: "report", label: tr("Template Laporan Aktivitas") },
            ]}
          />
          <TextField label={tr("Nama template")} value={name} onChange={setName} />
          <SelectField
            label={tr("Ukuran / preset")}
            value={preset}
            onChange={setPreset}
            options={
              kind === "receipt"
                ? [
                    { value: "58mm", label: "58 mm" },
                    { value: "80mm", label: "80 mm" },
                    { value: "digital", label: tr("Digital") },
                    { value: "a4", label: tr("A4 (210 mm)") },
    { value: "a5", label: tr("A5 (148 mm)") },
                    { value: "monochrome", label: tr("Monochrome") },
                  ]
                : REPORT_PRESETS
            }
          />
          <TextField label={tr("Override nama usaha (opsional)")} value={businessName} onChange={setBusinessName} />
          <TextField label={tr("Override alamat (opsional)")} value={address} onChange={setAddress} />
          <TextField label={tr("Kontak di struk/laporan (opsional)")} value={contact} onChange={setContact} />
          <TextField label={tr("Teks penutup")} value={closingText} onChange={setClosingText} />
          <Button loading={busy} onClick={() => void save()}>
            Simpan Versi Baru
          </Button>
        </div>
      </Card>
      <Card title={tr("Daftar Template Tersimpan")}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">{tr("Template Struk")}</p>
            <DataTable
              rows={data?.receiptTemplates ?? []}
              caption={tr("Template struk")}
              empty={tr("Belum ada template struk kustom.")}
              columns={[
                { key: "name", label: tr("Nama") },
                { key: "sizePreset", label: tr("Ukuran") },
                { key: "currentVersion", label: tr("Versi"), render: (r: any) => `v${r.currentVersion}` },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">{tr("Template Laporan")}</p>
            <DataTable
              rows={data?.reportTemplates ?? []}
              caption={tr("Template laporan")}
              empty={tr("Belum ada template laporan kustom.")}
              columns={[
                { key: "name", label: tr("Nama") },
                { key: "preset", label: tr("Preset") },
                { key: "currentVersion", label: tr("Versi"), render: (r: any) => `v${r.currentVersion}` },
              ]}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

function HistoryTab() {
  const { data, error, loading, reload } = useApi<any>("/exports/history");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function redownload(id: string) {
    setBusyId(id);
    try {
      const rec = await api<any>(`/exports/${id}`);
      if (rec.kind === "receipt") {
        await downloadReceiptFile(rec.snapshot, rec.format, rec.templatePreset, rec.templateConfig);
      } else {
        await downloadActivityFile(rec.snapshot, rec.format, rec.templatePreset, rec.templateConfig);
      }
      toast(tr("Berkas dibuat ulang identik dari snapshot tersimpan"));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <Loading />;

  return (
    <Card title={tr("Riwayat Ekspor (Unduh Ulang dari Snapshot)")}>
      <DataTable
        rows={data?.items ?? []}
        caption={tr("Riwayat ekspor")}
        empty={tr("Belum ada riwayat ekspor.")}
        columns={[
          { key: "reportNumber", label: tr("Nomor") },
          { key: "kind", label: tr("Jenis"), render: (r: any) => (r.kind === "receipt" ? "Struk" : "Aktivitas") },
          { key: "format", label: tr("Format"), render: (r: any) => String(r.format).toUpperCase() },
          { key: "templatePreset", label: tr("Template") },
          { key: "verificationCode", label: tr("Kode Verifikasi") },
          { key: "operator", label: tr("Pembuat") },
          { key: "createdAt", label: tr("Waktu"), render: (r: any) => fmtDateTime(r.createdAt) },
          {
            key: "a",
            label: "",
            render: (r: any) => (
              <Button variant="secondary" className="!min-h-[34px] !px-3 text-xs" loading={busyId === r.id} onClick={() => void redownload(r.id)}>
                Unduh Ulang
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}

function VerifyCodeTab() {
  const [code, setCode] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      setRes(await api(`/exports/verify?code=${encodeURIComponent(code.trim())}`));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={tr("Cek Kode Verifikasi Struk / Laporan")} desc={tr("Mencocokkan kode 8 karakter terhadap riwayat ekspor di workspace ini.")}>
      <div className="flex max-w-md gap-2">
        <TextField label={tr("Kode verifikasi")} value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder={tr("Contoh: AB12CD34")} />
        <div className="self-end">
          <Button loading={busy} onClick={() => void check()}>
            Cek Kode
          </Button>
        </div>
      </div>
      {res && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm">
          {res.valid ? (
            <div>
              <p className="font-bold text-primary-deep">Kode valid &amp; ditemukan di riwayat ekspor</p>
              <p className="mt-1 text-ink-2">
                Nomor: <strong>{res.record.reportNumber}</strong> · Dibuat: {fmtDateTime(res.record.createdAt)} · Pembuat: {res.record.operator}
              </p>
            </div>
          ) : (
            <p className="font-semibold text-[var(--color-danger-strong)]">{tr("Kode tidak ditemukan pada riwayat ekspor workspace ini.")}</p>
          )}
        </div>
      )}
    </Card>
  );
}
