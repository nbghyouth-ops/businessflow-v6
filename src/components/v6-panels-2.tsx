"use client";

import { tr } from "@/lib/tr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, fmtDate, toast, toInputDate, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { useBiz } from "./shell";
import {
  Badge, Button, Card, DataTable, Empty, ErrorBox, Kpi, Loading, Modal, SelectField, TextArea, TextField,
} from "./ui";

const err = (e: unknown) => toast((e as Error).message, "err");
const today = () => toInputDate(new Date());
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toInputDate(d);
};

function Money({ v }: { v: string | number | null | undefined }) {
  const biz = useBiz();
  return <span className="tnum">{formatMoney(v, biz.currency)}</span>;
}

/* ═══════════════════════════ PRAKIRAAN KAS ═══════════════════════════ */
export function ForecastPanel() {
  const [weeks, setWeeks] = useState("13");
  const { data, error, loading, reload } = useApi<any>(`/v6/forecast?weeks=${weeks}`);
  const rows: any[] = useMemo(() => data?.weeks ?? [], [data]);

  const bars = useMemo(() => {
    const values = rows.map((r) => Number(r.closing));
    const max = Math.max(1, ...values.map((v) => Math.abs(v)));
    return rows.map((r, i) => ({ ...r, pct: Math.min(100, Math.round((Math.abs(values[i]) / max) * 100)) }));
  }, [rows]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SelectField label={tr("Horizon")} value={weeks} onChange={setWeeks} options={[{ value: "4", label: "4 minggu" }, { value: "8", label: "8 minggu" }, { value: "13", label: "13 minggu" }, { value: "26", label: "26 minggu" }]} />
        <Button variant="secondary" onClick={reload}>{tr("Hitung ulang")}</Button>
      </div>

      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading text="Menghitung proyeksi…" /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi pastel="lavender" label={tr("Saldo kas saat ini")} value={<Money v={data.openingBalance} />} hint={tr("Dari jurnal kas & bank")} />
            <Kpi label={tr("Saldo terendah")} value={<Money v={data.minClosing} />} hint={data.minWeek ? `Minggu ke-${data.minWeek}` : "Tidak ada penurunan"} tone={data.health === "at_risk" ? "bad" : undefined} />
            <Kpi label={tr("Perkiraan bertahan")} value={data.runwayWeeks ? `${data.runwayWeeks} minggu` : "> horizon"} hint={data.health === "at_risk" ? "Kas diperkirakan negatif" : "Berdasarkan arus keluar tercatat"} />
            <Kpi label={tr("Keyakinan data")} value={data.confidence === "high" ? "Tinggi" : data.confidence === "medium" ? "Sedang" : "Rendah"} hint={`${data.sources.unpaidInvoices} faktur · ${data.sources.unpaidBills} tagihan`} />
          </div>

          <Card title={tr("Proyeksi per minggu")} desc={`Beban operasional rata-rata ${formatMoney(data.dailyOperatingExpense, data.currency ?? "IDR")}/hari dari 56 hari terakhir`}>
            <div className="mb-5 grid gap-2">
              {bars.map((r) => (
                <div key={r.week} className="grid grid-cols-[70px_1fr_120px] items-center gap-3">
                  <span className="text-xs text-ink-2">M{formatDate(r.start)}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-surface">
                    <div className={`h-3 rounded-full ${r.shortfall ? "bg-[var(--color-danger)]" : "bg-[var(--color-action)]"}`} style={{ width: `${Math.max(2, r.pct)}%` }} />
                  </div>
                  <span className="tnum text-right text-xs font-semibold"><Money v={r.closing} /></span>
                </div>
              ))}
            </div>
            <DataTable rows={rows} caption={tr("Rincian prakiraan kas")} columns={[
              { key: "week", label: tr("Minggu"), right: true },
              { key: "start", label: tr("Mulai"), render: (r: any) => fmtDate(r.start) },
              { key: "opening", label: tr("Saldo awal"), right: true, render: (r: any) => <Money v={r.opening} /> },
              { key: "inflow", label: tr("Masuk"), right: true, render: (r: any) => <Money v={r.inflow} /> },
              { key: "outflow", label: tr("Tagihan"), right: true, render: (r: any) => <Money v={r.outflow} /> },
              { key: "operating", label: tr("Operasional"), right: true, render: (r: any) => <Money v={r.operating} /> },
              { key: "closing", label: tr("Saldo akhir"), right: true, render: (r: any) => <span className={r.shortfall ? "text-[var(--color-danger)]" : ""}><Money v={r.closing} /></span> },
            ]} />
            <p className="mt-3 text-xs text-ink-2">{tr("Proyeksi memakai faktur belum lunas, tagihan supplier belum lunas (jatuh tempo 14 hari), dan rata-rata beban aktual. Tidak ada asumsi pertumbuhan.")}</p>
          </Card>
        </>
      )}
    </div>
  );
}

function formatDate(d: string) {
  return d ? d.slice(5).replace("-", "/") : "—";
}

/* ═══════════════════════════ BI ═══════════════════════════ */
export function BiPanel() {
  const [from, setFrom] = useState(daysAgo(89));
  const [to, setTo] = useState(today());
  const { data, error, loading, reload } = useApi<any>(`/v6/bi?from=${from}&to=${to}`);
  const pl = data?.profitLoss;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} max={to} />
        <TextField label={tr("Sampai")} type="date" value={to} onChange={setTo} min={from} />
        <Button variant="secondary" onClick={reload}>{tr("Terapkan")}</Button>
      </div>

      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi pastel="lavender" label={tr("Pendapatan")} value={<Money v={pl.revenue} />} hint={pl.grossMargin === null ? `Margin kotor N/A — ${pl.marginReason ?? "tidak tersedia"}` : `Margin kotor ${pl.grossMargin}%`} />
            <Kpi label={tr("Laba kotor")} value={<Money v={pl.grossProfit} />} hint={`HPP ${formatMoney(pl.cogs, "IDR")}`} />
            <Kpi label={tr("Beban operasional")} value={<Money v={pl.expense} />} hint={tr("Di luar HPP")} />
            <Kpi label={tr("Laba bersih")} value={<Money v={pl.netProfit} />} hint={pl.netMargin === null ? `Margin bersih N/A — ${pl.marginReason ?? "tidak tersedia"}` : `Margin bersih ${pl.netMargin}%`} tone={Number(pl.netProfit) < 0 ? "bad" : undefined} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label={tr("Kas & bank")} value={<Money v={data.cashBalance} />} hint={tr("Saldo jurnal")} />
            <Kpi label={tr("Piutang")} value={<Money v={data.receivables.value} />} hint={`${data.receivables.count} faktur terbuka`} />
            <Kpi label={tr("Utang supplier")} value={<Money v={data.payables.value} />} hint={`${data.payables.count} tagihan`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={tr("Produk teratas")} desc={tr("Berdasarkan nilai baris faktur pada periode")}>
              <DataTable rows={data.topProducts ?? []} caption={tr("Produk teratas")} empty={<Empty title={tr("Belum ada penjualan produk")} />} columns={[
                { key: "name", label: tr("Produk") },
                { key: "revenue", label: tr("Pendapatan"), right: true, render: (r: any) => <Money v={r.revenue} /> },
                { key: "qty", label: tr("Qty"), right: true },
              ]} />
            </Card>
            <Card title={tr("Klien teratas")} desc={tr("Berdasarkan total faktur")}>
              <DataTable rows={data.topClients ?? []} caption={tr("Klien teratas")} empty={<Empty title={tr("Belum ada faktur")} />} columns={[
                { key: "name", label: tr("Klien") },
                { key: "invoiceCount", label: tr("Faktur"), right: true },
                { key: "revenue", label: tr("Nilai"), right: true, render: (r: any) => <Money v={r.revenue} /> },
              ]} />
            </Card>
          </div>

          <Card title={tr("Tren 6 bulan")} desc={tr("Pendapatan vs beban dari jurnal")}>
            <DataTable rows={data.trend ?? []} caption={tr("Tren bulanan")} empty={<Empty title={tr("Belum ada jurnal")} />} columns={[
              { key: "month", label: tr("Bulan") },
              { key: "revenue", label: tr("Pendapatan"), right: true, render: (r: any) => <Money v={r.revenue} /> },
              { key: "expense", label: tr("Beban"), right: true, render: (r: any) => <Money v={r.expense} /> },
            ]} />
          </Card>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════ ETALASE ═══════════════════════════ */
export function StorefrontPanel() {
  const biz = useBiz();
  const [tab, setTab] = useState("settings");
  const { data, error, loading, reload } = useApi<any>("/v6/storefront");
  const [busy, setBusy] = useState(false);
  const item = data?.item;
  const empty = { slug: "", title: "", tagline: "", about: "", contactPhone: "", isPublished: false };
  const [draft, setDraft] = useState<typeof empty | null>(null);
  // Turunan langsung dari data server; suntingan pengguna disimpan di draft (tanpa effect).
  const form: typeof empty = draft ?? (item
    ? { slug: item.slug ?? "", title: item.title ?? "", tagline: item.tagline ?? "", about: item.about ?? "", contactPhone: item.contactPhone ?? "", isPublished: !!item.isPublished }
    : empty);
  const setForm = (fn: (s: typeof empty) => typeof empty) => setDraft(fn(form));

  async function save() {
    setBusy(true);
    try {
      await api("/v6/storefront", { method: "PATCH", body: { ...form, tagline: form.tagline || null, about: form.about || null, contactPhone: form.contactPhone || null } });
      toast(tr("Etalase disimpan")); reload();
    } catch (e) { err(e); } finally { setBusy(false); }
  }

  async function setPublished(v: boolean) {
    setBusy(true);
    try { await api("/v6/storefront", { method: "PATCH", body: { isPublished: v } }); toast(v ? "Etalase diterbitkan" : "Etalase ditarik"); reload(); }
    catch (e) { err(e); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm font-semibold text-ink-2">{tr("Katalog informasi")}</p>
        <div className="flex gap-2">
          {item && <Link href={`/s/${item.slug}`} target="_blank" className="inline-flex min-h-[44px] items-center rounded-xl border border-line px-4 text-sm font-semibold">{tr("Lihat etalase")}</Link>}
          <Button loading={busy} onClick={() => (item ? setPublished(!item.isPublished) : save())} variant={item?.isPublished ? "secondary" : "primary"}>
            {item?.isPublished ? "Tarik dari publikasi" : "Terbitkan"}
          </Button>
        </div>
      </div>

      {error ? <ErrorBox message={error} onRetry={reload} /> : loading ? <Loading /> : (
        <Card title={tr("Katalog informasi")} desc={tr("Hanya produk aktif yang tampil: nama, kategori, satuan, harga acuan, dan kontak. Tidak ada formulir pesanan atau permintaan dari publik.")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={tr("Slug publik *")} value={form.slug} onChange={(v) => setForm((s) => ({ ...s, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} help={`URL: /s/${form.slug || "slug-anda"}`} />
            <TextField label={tr("Judul *")} value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} />
            <TextField label={tr("Tagline")} value={form.tagline} onChange={(v) => setForm((s) => ({ ...s, tagline: v }))} />
            <TextField label={tr("Telepon/WA")} value={form.contactPhone} onChange={(v) => setForm((s) => ({ ...s, contactPhone: v }))} />
            <div className="sm:col-span-2"><TextArea label={tr("Tentang")} value={form.about} onChange={(v) => setForm((s) => ({ ...s, about: v }))} /></div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-2">{tr("Status:")} <Badge tone={item?.isPublished ? "good" : "neutral"}>{item?.isPublished ? tr("Terbit") : tr("Draf")}</Badge></p>
            <Button loading={busy} onClick={() => void save()}>{tr("Simpan")}</Button>
          </div>
        </Card>
      )}
    </>
  );
}

/* ═══════════════════════════ RFQ ═══════════════════════════ */
export function RfqPanel() {
  const biz = useBiz();
  const list = useApi<any>("/v6/rfq");
  const clients = useApi<any>("/r/clients?limit=300");
  const [create, setCreate] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const detailApi = useApi<any>(detail ? `/v6/rfq/${detail.id}` : null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ clientId: "", title: "", details: "", dueDate: "" });
  const [quote, setQuote] = useState({ amount: "", validUntil: "", note: "" });

  async function submit(kind: string, body: unknown, after?: () => void) {
    setBusy(true);
    try { await api(kind, { body }); toast(tr("Tersimpan")); after?.(); }
    catch (e) { err(e); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreate(true)}>+ Permintaan</Button>
      </div>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loading /> : (
        <DataTable rows={list.data?.items ?? []} caption={tr("Daftar RFQ")} empty={<Empty title={tr("Belum ada permintaan penawaran")} hint={tr("Catat permintaan klien, lalu kirim kutipan harga.")} action={<Button onClick={() => setCreate(true)}>+ Permintaan</Button>} />} columns={[
          { key: "number", label: tr("Nomor") },
          { key: "title", label: tr("Judul") },
          { key: "clientName", label: tr("Klien"), render: (r: any) => r.clientName ?? "—" },
          { key: "dueDate", label: tr("Tenggat"), render: (r: any) => (r.dueDate ? fmtDate(r.dueDate) : "—") },
          { key: "quoteCount", label: tr("Kutipan"), right: true },
          { key: "bestAmount", label: tr("Nilai terakhir"), right: true, render: (r: any) => (r.bestAmount ? <Money v={r.bestAmount} /> : "—") },
          { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status}>{r.status}</Badge> },
          { key: "a", label: "", render: (r: any) => <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => setDetail(r)}>Buka</Button> },
        ]} />
      )}

      <Modal open={create} onClose={() => setCreate(false)} title={tr("Permintaan penawaran baru")} footer={<><Button variant="secondary" onClick={() => setCreate(false)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void submit("/v6/rfq", { ...form, clientId: form.clientId || null, details: form.details || null, dueDate: form.dueDate || null }, () => { setCreate(false); setForm({ clientId: "", title: "", details: "", dueDate: "" }); list.reload(); })}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={tr("Klien")} value={form.clientId} onChange={(v) => setForm((s) => ({ ...s, clientId: v }))} options={(clients.data?.items ?? []).map((c: any) => ({ value: c.id, label: c.name }))} placeholder={tr("Tanpa klien")} />
          <TextField label={tr("Tenggat")} type="date" value={form.dueDate} onChange={(v) => setForm((s) => ({ ...s, dueDate: v }))} />
          <div className="sm:col-span-2"><TextField label={tr("Judul *")} value={form.title} onChange={(v) => setForm((s) => ({ ...s, title: v }))} /></div>
          <div className="sm:col-span-2"><TextArea label={tr("Rincian")} value={form.details} onChange={(v) => setForm((s) => ({ ...s, details: v }))} /></div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `RFQ ${detail.number}` : "RFQ"} size="lg">
        {detailApi.loading && !detailApi.data ? <Loading /> : detailApi.data && (
          <div className="grid gap-4">
            <div className="rounded-2xl bg-surface p-4">
              <p className="font-semibold">{detailApi.data.item.title}</p>
              <p className="mt-1 text-sm text-ink-2">{detailApi.data.item.details || "Tanpa rincian."}</p>
              <p className="mt-2 text-xs">{tr("Status:")} <Badge status={detailApi.data.item.status}>{detailApi.data.item.status}</Badge>{detailApi.data.item.dueDate ? ` · tenggat ${fmtDate(detailApi.data.item.dueDate)}` : ""}</p>
            </div>
            <DataTable rows={detailApi.data.quotes ?? []} caption={tr("Kutipan")} empty={<Empty title={tr("Belum ada kutipan")} />} columns={[
              { key: "createdAt", label: tr("Dibuat"), render: (r: any) => fmtDate(r.createdAt) },
              { key: "amount", label: tr("Nilai"), right: true, render: (r: any) => <Money v={r.amount} /> },
              { key: "validUntil", label: tr("Berlaku s.d."), render: (r: any) => (r.validUntil ? fmtDate(r.validUntil) : "—") },
              { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status}>{r.status}</Badge> },
              { key: "a", label: "", render: (r: any) => r.status === "sent" ? (
                <div className="flex gap-1">
                  <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => void submit(`/v6/rfq/quotes/${r.id}/decide`, { decision: "accepted" }, () => { detailApi.reload(); list.reload(); })}>{tr("Terima")}</Button>
                  <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => void submit(`/v6/rfq/quotes/${r.id}/decide`, { decision: "rejected" }, () => { detailApi.reload(); list.reload(); })}>{tr("Tolak")}</Button>
                </div>
              ) : null },
            ]} />
            {!["accepted", "closed", "cancelled"].includes(detailApi.data.item.status) && (
              <div className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
                <TextField label={`Nilai kutipan (${biz.currency})`} inputMode="decimal" value={quote.amount} onChange={(v) => setQuote((s) => ({ ...s, amount: v.replace(/[^\d.]/g, "") }))} />
                <TextField label={tr("Berlaku sampai")} type="date" value={quote.validUntil} onChange={(v) => setQuote((s) => ({ ...s, validUntil: v }))} />
                <div className="sm:col-span-2"><TextField label={tr("Catatan")} value={quote.note} onChange={(v) => setQuote((s) => ({ ...s, note: v }))} /></div>
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => void submit(`/v6/rfq/${detail.id}/close`, {}, () => { detailApi.reload(); list.reload(); })}>{tr("Tutup RFQ")}</Button>
                  <Button loading={busy} onClick={() => void submit(`/v6/rfq/${detail.id}/quotes`, { amount: quote.amount, validUntil: quote.validUntil || null, note: quote.note || null }, () => { setQuote({ amount: "", validUntil: "", note: "" }); detailApi.reload(); list.reload(); })}>{tr("Kirim kutipan")}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/* ═══════════════════════════ PEMBELAJARAN ═══════════════════════════ */
export function LearningPanel() {
  const { data, error, loading, reload } = useApi<any>("/v6/learning");
  const biz = useBiz();
  const lang = (biz.business.language === "en" ? "en" : "id") as "id" | "en";
  const [busy, setBusy] = useState("");
  const progress = new Map<string, any>((data?.items ?? []).map((p: any) => [p.lessonKey, p]));

  async function mark(key: string, status: "started" | "completed") {
    setBusy(key);
    try { await api(`/v6/learning/${key}`, { body: { status } }); toast(status === "completed" ? "Materi selesai" : "Materi dimulai"); reload(); }
    catch (e) { err(e); } finally { setBusy(""); }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const done = (data?.items ?? []).filter((p: any) => p.status === "completed").length;
  const lessons: any[] = data?.lessons ?? [];

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi pastel="lavender" label={tr("Materi selesai")} value={`${done} / ${lessons.length}`} hint={tr("Progres tersimpan per pengguna")} />
        <Kpi label={tr("Estimasi total")} value={`${lessons.reduce((n, l) => n + (l.minutes ?? 0), 0)} menit`} hint={tr("Enam materi alur kerja")} />
        <Kpi label={tr("Fokus")} value="Praktik" hint={tr("Setiap materi merujuk modul nyata di aplikasi")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {lessons.map((l) => {
          const p = progress.get(l.key);
          const isDone = p?.status === "completed";
          return (
            <Card key={l.key} title={l.title?.[lang] ?? l.key} desc={`${l.minutes} menit · ${isDone ? "selesai" : p ? "sedang dipelajari" : "belum dimulai"}`} actions={<Badge tone={isDone ? "good" : p ? "info" : "neutral"}>{isDone ? "Selesai" : p ? "Berjalan" : "Baru"}</Badge>}>
              <p className="text-sm text-ink-2">{l.summary?.[lang] ?? ""}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" loading={busy === l.key} onClick={() => void mark(l.key, "started")} disabled={isDone}>{tr("Mulai")}</Button>
                <Button loading={busy === l.key} onClick={() => void mark(l.key, "completed")} disabled={isDone}>{tr("Tandai selesai")}</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
