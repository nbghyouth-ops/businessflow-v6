"use client";

import { tr } from "@/lib/tr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, fmtDate, fmtDateTime, toast, toInputDate, useApi } from "@/lib/client";
import { fromCents, formatMoney, toCents } from "@/lib/money";
import { useBiz } from "./shell";
import {
  Badge, Button, Card, DataTable, Empty, ErrorBox, Kpi, Loading, Modal, SelectField, Tabs, TextArea, TextField,
} from "./ui";

const err = (e: unknown) => toast((e as Error).message, "err");
const today = () => toInputDate(new Date());
const monthNow = () => new Date().toISOString().slice(0, 7);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toInputDate(d);
};

function Money({ v }: { v: string | number | null | undefined }) {
  const biz = useBiz();
  return <span className="tnum">{formatMoney(v, biz.currency)}</span>;
}

/* ═══════════════════════════ MARKETPLACE ═══════════════════════════ */
export function MarketplacePanel() {
  const biz = useBiz();
  const [tab, setTab] = useState("summary");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const channels = useApi<any>("/v6/marketplace/channels");
  const orders = useApi<any>(tab === "orders" ? `/v6/marketplace/orders?from=${from}&to=${to}` : null);
  const summary = useApi<any>(tab === "summary" ? `/v6/marketplace/summary?from=${from}&to=${to}` : null);
  const settlements = useApi<any>(tab === "settlements" ? "/v6/marketplace/settlements" : null);
  const accounts = useApi<any>("/finance/cash-accounts");
  const [modal, setModal] = useState<"channel" | "order" | "settlement" | null>(null);
  const [busy, setBusy] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: "", kind: "shopee", feePercent: "0" });
  const [orderForm, setOrderForm] = useState({ channelId: "", orderNo: "", occurredOn: today(), grossAmount: "", discount: "", platformFee: "", shippingCost: "", note: "" });
  const [setForm, setSetForm] = useState({ channelId: "", periodStart: daysAgo(7), periodEnd: today(), grossAmount: "", feeAmount: "", netAmount: "", cashAccountId: "", note: "" });
  const channelList: any[] = channels.data?.items ?? [];
  const canWrite = biz.can("marketplace:write");

  const reload = () => { channels.reload(); orders.reload(); summary.reload(); settlements.reload(); };

  async function submitChannel() {
    setBusy(true);
    try {
      await api("/v6/marketplace/channels", { body: channelForm });
      toast(tr("Kanal ditambahkan")); setModal(null); setChannelForm({ name: "", kind: "shopee", feePercent: "0" }); reload();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  // Tidak ada simpan/hapus kredensial kanal: kanal di sini hanya label data tercatat
  // dan aplikasi tidak menyambung ke API pihak ketiga (prompt R7-C §1, larangan L6).
  async function submitOrder() {
    setBusy(true);
    try {
      await api("/v6/marketplace/orders", {
        body: {
          channelId: orderForm.channelId, orderNo: orderForm.orderNo, occurredOn: orderForm.occurredOn,
          grossAmount: orderForm.grossAmount, discount: orderForm.discount || "0",
          platformFee: orderForm.platformFee || "0", shippingCost: orderForm.shippingCost || "0",
          note: orderForm.note || null,
        },
      });
      toast(tr("Pesanan dicatat")); setModal(null); reload();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  async function submitSettlement() {
    setBusy(true);
    try {
      await api("/v6/marketplace/settlements", {
        body: {
          channelId: setForm.channelId, periodStart: setForm.periodStart, periodEnd: setForm.periodEnd,
          grossAmount: setForm.grossAmount, feeAmount: setForm.feeAmount || "0",
          netAmount: setForm.netAmount || fromCents(toCents(setForm.grossAmount || "0") - toCents(setForm.feeAmount || "0")),
          cashAccountId: setForm.cashAccountId || null, note: setForm.note || null,
        },
      });
      toast(tr("Settlement dicatat & dijurnal")); setModal(null); reload();
    } catch (e) { err(e); } finally { setBusy(false); }
  }

  const netPreview = (() => {
    const g = orderForm.grossAmount || "0";
    if (!/^\d{1,15}(\.\d{1,2})?$/.test(g)) return "—";
    const v = toCents(g) - toCents(orderForm.discount || "0") - toCents(orderForm.platformFee || "0") - toCents(orderForm.shippingCost || "0");
    return v < 0n ? "negatif — periksa input" : fromCents(v);
  })();

  const totals = summary.data?.totals;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={[{ key: "summary", label: tr("Ringkasan") }, { key: "orders", label: tr("Pesanan") }, { key: "settlements", label: tr("Settlement") }, { key: "channels", label: tr("Kanal") }]} value={tab} onChange={setTab} />
        <div className="flex flex-wrap items-end gap-2">
          {(tab === "summary" || tab === "orders") && (
            <>
              <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} max={to} />
              <TextField label={tr("Sampai")} type="date" value={to} onChange={setTo} min={from} />
            </>
          )}
          {canWrite && tab === "channels" && <Button onClick={() => setModal("channel")}>+ Kanal</Button>}
          {/* Tidak ada tombol "sambungkan kanal" — kanal hanya label pencatatan. */}
          {canWrite && tab === "orders" && <Button onClick={() => setModal("order")} disabled={!channelList.length}>+ Pesanan</Button>}
          {canWrite && tab === "settlements" && <Button onClick={() => setModal("settlement")} disabled={!channelList.length}>+ Settlement</Button>}
        </div>
      </div>

      {tab === "summary" && (
        summary.error ? <ErrorBox message={summary.error} onRetry={summary.reload} /> : summary.loading && !summary.data ? <Loading /> : (
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi pastel="lavender" label={tr("Penjualan bruto")} value={<Money v={totals?.gross} />} hint={`${from} s.d. ${to}`} />
              <Kpi label={tr("Biaya platform")} value={<Money v={totals?.fee} />} hint={tr("Tidak dihitung dua kali sebagai beban saat settlement")} />
              <Kpi label={tr("Penerimaan bersih")} value={<Money v={totals?.net} />} hint={tr("Bruto − diskon − biaya − ongkir")} />
            </div>
            <Card title={tr("Per kanal")} desc={tr("Angka dari pesanan tercatat pada periode ini")}>
              <DataTable
                rows={summary.data?.items ?? []}
                caption={tr("Ringkasan marketplace per kanal")}
                empty={<Empty title={tr("Belum ada kanal")} hint={tr("Tambahkan kanal marketplace terlebih dahulu.")} />}
                columns={[
                  { key: "channelName", label: tr("Kanal") },
                  { key: "orderCount", label: tr("Pesanan"), right: true },
                  { key: "gross", label: tr("Bruto"), right: true, render: (r: any) => <Money v={r.gross} /> },
                  { key: "fee", label: tr("Biaya"), right: true, render: (r: any) => <Money v={r.fee} /> },
                  { key: "net", label: tr("Neto"), right: true, render: (r: any) => <Money v={r.net} /> },
                  { key: "feePercent", label: tr("Fee %"), right: true, render: (r: any) => `${r.feePercent}%` },
                ]}
              />
            </Card>
          </div>
        )
      )}

      {tab === "orders" && (
        orders.error ? <ErrorBox message={orders.error} onRetry={orders.reload} /> : orders.loading && !orders.data ? <Loading /> : (
          <DataTable
            rows={orders.data?.items ?? []}
            caption={tr("Pesanan marketplace")}
            empty={<Empty title={tr("Belum ada pesanan")} hint={tr("Catat pesanan marketplace pertama Anda; angka bruto dan neto dihitung server.")} />}
            columns={[
              { key: "occurredOn", label: tr("Tanggal"), render: (r: any) => fmtDate(r.occurredOn) },
              { key: "channelName", label: tr("Kanal") },
              { key: "orderNo", label: tr("No. pesanan") },
              { key: "grossAmount", label: tr("Bruto"), right: true, render: (r: any) => <Money v={r.grossAmount} /> },
              { key: "platformFee", label: tr("Biaya"), right: true, render: (r: any) => <Money v={r.platformFee} /> },
              { key: "netAmount", label: tr("Neto"), right: true, render: (r: any) => <Money v={r.netAmount} /> },
              { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
            ]}
          />
        )
      )}

      {tab === "settlements" && (
        settlements.error ? <ErrorBox message={settlements.error} onRetry={settlements.reload} /> : settlements.loading && !settlements.data ? <Loading /> : (
          <DataTable
            rows={settlements.data?.items ?? []}
            caption={tr("Settlement marketplace")}
            empty={<Empty title={tr("Belum ada settlement")} hint={tr("Settlement yang disertai akun kas akan otomatis membentuk jurnal: kas + biaya platform vs pendapatan.")} />}
            columns={[
              { key: "periodStart", label: tr("Periode"), render: (r: any) => `${fmtDate(r.periodStart)} – ${fmtDate(r.periodEnd)}` },
              { key: "channelName", label: tr("Kanal") },
              { key: "gross", label: tr("Bruto"), right: true, render: (r: any) => <Money v={r.gross} /> },
              { key: "fee", label: tr("Biaya"), right: true, render: (r: any) => <Money v={r.fee} /> },
              { key: "net", label: tr("Diterima"), right: true, render: (r: any) => <Money v={r.net} /> },
              { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status === "received" ? "paid" : "draft"}>{r.status}</Badge> },
              { key: "journalId", label: tr("Jurnal"), render: (r: any) => (r.journalId ? "Terjurnal" : "—") },
            ]}
          />
        )
      )}

      {tab === "channels" && (
        channels.error ? <ErrorBox message={channels.error} onRetry={channels.reload} /> : channels.loading && !channels.data ? <Loading /> : (
          <DataTable
            rows={channelList}
            caption={tr("Kanal marketplace")}
            empty={<Empty title={tr("Belum ada kanal")} hint={tr("Tambahkan Shopee, Tokopedia, TikTok Shop, atau kanal manual.")} action={canWrite ? <Button onClick={() => setModal("channel")}>+ Kanal</Button> : undefined} />}
            columns={[
              { key: "name", label: tr("Nama") },
              { key: "kind", label: tr("Jenis") },
              { key: "feePercent", label: tr("Fee %"), right: true },
              { key: "orderCount", label: tr("Pesanan"), right: true },
              { key: "isActive", label: tr("Aktif"), render: (r: any) => (r.isActive ? tr("Ya") : tr("Tidak")) },
            ]}
          />
        )
      )}

      <Modal open={modal === "channel"} onClose={() => setModal(null)} title={tr("Tambah kanal marketplace")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void submitChannel()}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={tr("Nama kanal *")} value={channelForm.name} onChange={(v) => setChannelForm((s) => ({ ...s, name: v }))} />
          <SelectField label={tr("Jenis")} value={channelForm.kind} onChange={(v) => setChannelForm((s) => ({ ...s, kind: v }))} options={[{ value: "shopee", label: tr("Shopee") }, { value: "tokopedia", label: tr("Tokopedia") }, { value: "tiktok", label: tr("TikTok Shop") }, { value: "manual", label: tr("Manual") }]} />
          <TextField label={tr("Fee platform (%)")} inputMode="decimal" value={channelForm.feePercent} onChange={(v) => setChannelForm((s) => ({ ...s, feePercent: v.replace(/[^\d.]/g, "") }))} help={tr("Dipakai sebagai referensi; biaya aktual tetap diisi per pesanan.")} />
        </div>
      </Modal>

      <Modal open={modal === "order"} onClose={() => setModal(null)} title={tr("Catat pesanan marketplace")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void submitOrder()}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={tr("Kanal *")} value={orderForm.channelId} onChange={(v) => setOrderForm((s) => ({ ...s, channelId: v }))} options={channelList.map((c: any) => ({ value: c.id, label: c.name }))} placeholder={tr("Pilih kanal…")} />
          <TextField label={tr("No. pesanan *")} value={orderForm.orderNo} onChange={(v) => setOrderForm((s) => ({ ...s, orderNo: v }))} />
          <TextField label={tr("Tanggal *")} type="date" value={orderForm.occurredOn} onChange={(v) => setOrderForm((s) => ({ ...s, occurredOn: v }))} />
          <TextField label={tr("Bruto *")} inputMode="decimal" value={orderForm.grossAmount} onChange={(v) => setOrderForm((s) => ({ ...s, grossAmount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Diskon")} inputMode="decimal" value={orderForm.discount} onChange={(v) => setOrderForm((s) => ({ ...s, discount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Biaya platform")} inputMode="decimal" value={orderForm.platformFee} onChange={(v) => setOrderForm((s) => ({ ...s, platformFee: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Ongkir ditanggung penjual")} inputMode="decimal" value={orderForm.shippingCost} onChange={(v) => setOrderForm((s) => ({ ...s, shippingCost: v.replace(/[^\d.]/g, "") }))} />
          <div className="sm:col-span-2 rounded-xl bg-surface px-3 py-2 text-sm">{tr("Penerimaan bersih (dihitung):")} <strong>{netPreview === "—" || netPreview.startsWith("negatif") ? netPreview : formatMoney(netPreview, biz.currency)}</strong></div>
          <div className="sm:col-span-2"><TextArea label={tr("Catatan")} value={orderForm.note} onChange={(v) => setOrderForm((s) => ({ ...s, note: v }))} /></div>
        </div>
      </Modal>

      <Modal open={modal === "settlement"} onClose={() => setModal(null)} title={tr("Catat settlement")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void submitSettlement()}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={tr("Kanal *")} value={setForm.channelId} onChange={(v) => setSetForm((s) => ({ ...s, channelId: v }))} options={channelList.map((c: any) => ({ value: c.id, label: c.name }))} placeholder={tr("Pilih kanal…")} />
          <SelectField label={tr("Akun kas penerima")} value={setForm.cashAccountId} onChange={(v) => setSetForm((s) => ({ ...s, cashAccountId: v }))} options={(accounts.data?.items ?? []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder={tr("Tanpa jurnal (catat saja)")} />
          <TextField label={tr("Periode mulai *")} type="date" value={setForm.periodStart} onChange={(v) => setSetForm((s) => ({ ...s, periodStart: v }))} />
          <TextField label={tr("Periode akhir *")} type="date" value={setForm.periodEnd} onChange={(v) => setSetForm((s) => ({ ...s, periodEnd: v }))} />
          <TextField label={tr("Bruto *")} inputMode="decimal" value={setForm.grossAmount} onChange={(v) => setSetForm((s) => ({ ...s, grossAmount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Biaya platform")} inputMode="decimal" value={setForm.feeAmount} onChange={(v) => setSetForm((s) => ({ ...s, feeAmount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Neto diterima *")} inputMode="decimal" value={setForm.netAmount} onChange={(v) => setSetForm((s) => ({ ...s, netAmount: v.replace(/[^\d.]/g, "") }))} help={tr("Harus sama dengan bruto − biaya; server menolak bila tidak cocok.")} />
          <div className="sm:col-span-2"><TextArea label={tr("Catatan")} value={setForm.note} onChange={(v) => setSetForm((s) => ({ ...s, note: v }))} /></div>
        </div>
      </Modal>
    </>
  );
}

/* ═══════════════════════════ KEUANGAN PRIBADI ═══════════════════════════ */
export function PersonalPanel() {
  const biz = useBiz();
  const [tab, setTab] = useState("summary");
  const [month, setMonth] = useState(monthNow());
  const summary = useApi<any>(`/v6/personal/summary?month=${month}`);
  const accounts = useApi<any>("/v6/personal/accounts");
  const txs = useApi<any>(tab === "transactions" ? "/v6/personal/transactions?limit=200" : null);
  const goals = useApi<any>("/v6/personal/goals");
  const [modal, setModal] = useState<"account" | "tx" | "budget" | "goal" | null>(null);
  const [busy, setBusy] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", kind: "cash", openingBalance: "" });
  const [txForm, setTxForm] = useState({ accountId: "", toAccountId: "", type: "expense", amount: "", category: "", occurredOn: today(), note: "" });
  const [budgetForm, setBudgetForm] = useState({ month: monthNow(), category: "", amount: "" });
  const [goalForm, setGoalForm] = useState({ name: "", targetAmount: "", savedAmount: "", targetDate: "" });
  const own = biz.can("personal:read");

  if (!own) return <Empty title={tr("Ruang pribadi hanya untuk pemilik")} hint={tr("Peran lain tidak dapat membuka keuangan pribadi. Ini pemisahan ruang data (R4), bukan sekadar izin.")} />;

  const reload = () => { summary.reload(); accounts.reload(); txs.reload(); goals.reload(); };

  async function save(kind: string, body: unknown) {
    setBusy(true);
    try {
      await api(kind, { body });
      toast(tr("Tersimpan")); setModal(null); reload();
    } catch (e) { err(e); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={[{ key: "summary", label: tr("Ringkasan") }, { key: "accounts", label: tr("Akun") }, { key: "transactions", label: tr("Transaksi") }, { key: "budgets", label: tr("Anggaran") }, { key: "goals", label: tr("Tujuan") }]} value={tab} onChange={setTab} />
        <div className="flex flex-wrap items-end gap-2">
          {tab === "summary" && <TextField label={tr("Bulan")} type="month" value={month} onChange={setMonth} />}
          {tab === "accounts" && <Button onClick={() => setModal("account")}>+ Akun pribadi</Button>}
          {tab === "transactions" && <Button onClick={() => setModal("tx")} disabled={!(accounts.data?.items ?? []).length}>+ Transaksi</Button>}
          {tab === "budgets" && <Button onClick={() => setModal("budget")}>+ Anggaran</Button>}
          {tab === "goals" && <Button onClick={() => setModal("goal")}>+ Tujuan</Button>}
        </div>
      </div>

      {summary.error ? <ErrorBox message={summary.error} onRetry={summary.reload} /> : summary.loading && !summary.data ? <Loading /> : tab === "summary" && summary.data && (
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi pastel="lavender" label={tr("Saldo pribadi")} value={<Money v={summary.data.balance} />} hint={tr("Seluruh akun pribadi")} />
            <Kpi label={tr("Pemasukan bulan ini")} value={<Money v={summary.data.income} />} hint={month} />
            <Kpi label={tr("Pengeluaran bulan ini")} value={<Money v={summary.data.expense} />} hint={`Neto ${formatMoney(summary.data.net, biz.currency)}`} />
          </div>
          <Card title={tr("Anggaran bulan ini")} desc={tr("Pemakaian dihitung dari transaksi pribadi berjalan")}>
            <DataTable rows={summary.data.budgets ?? []} caption={tr("Anggaran pribadi")} empty={<Empty title={tr("Belum ada anggaran")} hint={tr("Tetapkan anggaran per kategori untuk melihat pemakaian.")} />} columns={[
              { key: "category", label: tr("Kategori") },
              { key: "amount", label: tr("Anggaran"), right: true, render: (r: any) => <Money v={r.amount} /> },
              { key: "spent", label: tr("Terpakai"), right: true, render: (r: any) => <Money v={r.spent} /> },
              { key: "usage", label: tr("Pemakaian"), right: true, render: (r: any) => <Badge tone={Number(r.usage) > 100 ? "bad" : Number(r.usage) > 80 ? "warn" : "good"}>{r.usage}%</Badge> },
            ]} />
          </Card>
          <p className="text-xs text-ink-2">{tr("Ruang ini tidak muncul pada laporan bisnis dan tidak dapat dibaca workspace lain.")}</p>
        </div>
      )}

      {tab === "accounts" && (accounts.loading && !accounts.data ? <Loading /> : (
        <DataTable rows={accounts.data?.items ?? []} caption={tr("Akun pribadi")} empty={<Empty title={tr("Belum ada akun pribadi")} hint={tr("Tambahkan akun kas, rekening bank, atau uang tunai pribadi.")} action={<Button onClick={() => setModal("account")}>+ Akun pribadi</Button>} />} columns={[
          { key: "name", label: tr("Nama") },
          { key: "kind", label: tr("Jenis") },
          { key: "balance", label: tr("Saldo"), right: true, render: (r: any) => <Money v={r.balance} /> },
          { key: "currency", label: tr("Mata uang") },
        ]} />
      ))}

      {tab === "transactions" && (txs.loading && !txs.data ? <Loading /> : (
        <DataTable rows={txs.data?.items ?? []} caption={tr("Transaksi pribadi")} empty={<Empty title={tr("Belum ada transaksi pribadi")} hint={tr("Catat pemasukan, pengeluaran, atau transfer antar akun pribadi.")} />} columns={[
          { key: "occurredOn", label: tr("Tanggal"), render: (r: any) => fmtDate(r.occurredOn) },
          { key: "type", label: tr("Jenis"), render: (r: any) => <Badge status={r.type} /> },
          { key: "accountName", label: tr("Akun") },
          { key: "category", label: tr("Kategori"), render: (r: any) => r.category ?? "—" },
          { key: "amount", label: tr("Nominal"), right: true, render: (r: any) => <Money v={r.amount} /> },
        ]} />
      ))}

      {tab === "budgets" && (summary.loading ? <Loading /> : (
        <DataTable rows={summary.data?.budgets ?? []} caption={tr("Anggaran pribadi")} empty={<Empty title={tr("Belum ada anggaran")} action={<Button onClick={() => setModal("budget")}>+ Anggaran</Button>} />} columns={[
          { key: "month", label: tr("Bulan") }, { key: "category", label: tr("Kategori") },
          { key: "amount", label: tr("Anggaran"), right: true, render: (r: any) => <Money v={r.amount} /> },
          { key: "spent", label: tr("Terpakai"), right: true, render: (r: any) => <Money v={r.spent} /> },
        ]} />
      ))}

      {tab === "goals" && (goals.loading && !goals.data ? <Loading /> : (
        <DataTable rows={goals.data?.items ?? []} caption={tr("Tujuan tabungan")} empty={<Empty title={tr("Belum ada tujuan")} hint={tr("Tentukan target dan catat kontribusi.")} action={<Button onClick={() => setModal("goal")}>+ Tujuan</Button>} />} columns={[
          { key: "name", label: tr("Tujuan") },
          { key: "targetAmount", label: tr("Target"), right: true, render: (r: any) => <Money v={r.targetAmount} /> },
          { key: "savedAmount", label: tr("Tersimpan"), right: true, render: (r: any) => <Money v={r.savedAmount} /> },
          { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
          { key: "a", label: "", render: (r: any) => <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => { const v = prompt("Nominal kontribusi:"); if (v && /^\d+(\.\d{1,2})?$/.test(v)) void save(`/v6/personal/goals/${r.id}/contribute`, { amount: v }); }}>{tr("Kontribusi")}</Button> },
        ]} />
      ))}

      <Modal open={modal === "account"} onClose={() => setModal(null)} title={tr("Tambah akun pribadi")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void save("/v6/personal/accounts", { ...accForm, openingBalance: accForm.openingBalance || "0" })}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={tr("Nama *")} value={accForm.name} onChange={(v) => setAccForm((s) => ({ ...s, name: v }))} />
          <SelectField label={tr("Jenis")} value={accForm.kind} onChange={(v) => setAccForm((s) => ({ ...s, kind: v }))} options={[{ value: "cash", label: tr("Tunai") }, { value: "bank", label: tr("Bank") }, { value: "other", label: tr("Lainnya") }]} />
          <TextField label={tr("Saldo awal")} inputMode="decimal" value={accForm.openingBalance} onChange={(v) => setAccForm((s) => ({ ...s, openingBalance: v.replace(/[^\d.]/g, "") }))} />
        </div>
      </Modal>

      <Modal open={modal === "tx"} onClose={() => setModal(null)} title={tr("Catat transaksi pribadi")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void save("/v6/personal/transactions", { ...txForm, category: txForm.category || null, note: txForm.note || null, toAccountId: txForm.type === "transfer" ? txForm.toAccountId : null })}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={tr("Jenis")} value={txForm.type} onChange={(v) => setTxForm((s) => ({ ...s, type: v }))} options={[{ value: "expense", label: tr("Pengeluaran") }, { value: "income", label: tr("Pemasukan") }, { value: "transfer", label: tr("Transfer") }]} />
          <TextField label={tr("Tanggal *")} type="date" value={txForm.occurredOn} onChange={(v) => setTxForm((s) => ({ ...s, occurredOn: v }))} />
          <SelectField label={tr("Akun *")} value={txForm.accountId} onChange={(v) => setTxForm((s) => ({ ...s, accountId: v }))} options={(accounts.data?.items ?? []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder={tr("Pilih akun…")} />
          {txForm.type === "transfer" && <SelectField label={tr("Ke akun *")} value={txForm.toAccountId} onChange={(v) => setTxForm((s) => ({ ...s, toAccountId: v }))} options={(accounts.data?.items ?? []).filter((a: any) => a.id !== txForm.accountId).map((a: any) => ({ value: a.id, label: a.name }))} placeholder={tr("Pilih akun…")} />}
          <TextField label={tr("Nominal *")} inputMode="decimal" value={txForm.amount} onChange={(v) => setTxForm((s) => ({ ...s, amount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Kategori")} value={txForm.category} onChange={(v) => setTxForm((s) => ({ ...s, category: v }))} />
          <div className="sm:col-span-2"><TextArea label={tr("Catatan")} value={txForm.note} onChange={(v) => setTxForm((s) => ({ ...s, note: v }))} /></div>
        </div>
      </Modal>

      <Modal open={modal === "budget"} onClose={() => setModal(null)} title={tr("Tetapkan anggaran pribadi")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void save("/v6/personal/budgets", budgetForm)}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={tr("Bulan *")} type="month" value={budgetForm.month} onChange={(v) => setBudgetForm((s) => ({ ...s, month: v }))} />
          <TextField label={tr("Kategori *")} value={budgetForm.category} onChange={(v) => setBudgetForm((s) => ({ ...s, category: v }))} />
          <TextField label={tr("Anggaran *")} inputMode="decimal" value={budgetForm.amount} onChange={(v) => setBudgetForm((s) => ({ ...s, amount: v.replace(/[^\d.]/g, "") }))} />
        </div>
      </Modal>

      <Modal open={modal === "goal"} onClose={() => setModal(null)} title={tr("Tambah tujuan tabungan")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void save("/v6/personal/goals", { ...goalForm, savedAmount: goalForm.savedAmount || "0", targetDate: goalForm.targetDate || null })}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={tr("Nama tujuan *")} value={goalForm.name} onChange={(v) => setGoalForm((s) => ({ ...s, name: v }))} />
          <TextField label={tr("Target *")} inputMode="decimal" value={goalForm.targetAmount} onChange={(v) => setGoalForm((s) => ({ ...s, targetAmount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Sudah tersimpan")} inputMode="decimal" value={goalForm.savedAmount} onChange={(v) => setGoalForm((s) => ({ ...s, savedAmount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Target tanggal")} type="date" value={goalForm.targetDate} onChange={(v) => setGoalForm((s) => ({ ...s, targetDate: v }))} />
        </div>
      </Modal>
    </>
  );
}

/* ═══════════════════════════ JEMBATAN PEMILIK ═══════════════════════════ */
export function BridgePanel() {
  const [tab, setTab] = useState("mappings");
  const mappings = useApi<any>("/v6/bridge/mappings");
  const postings = useApi<any>(tab === "postings" ? "/v6/bridge/postings" : null);
  const accounts = useApi<any>("/finance/cash-accounts");
  const coa = useApi<any>("/finance/coa");
  const [modal, setModal] = useState<"mapping" | "post" | null>(null);
  const [busy, setBusy] = useState(false);
  const [mForm, setMForm] = useState({ label: "", direction: "personal_to_business", personalCategory: "", cashAccountId: "", coaAccountId: "" });
  const [pForm, setPForm] = useState({ mappingId: "", amount: "", postedOn: today(), note: "" });
  const list: any[] = mappings.data?.items ?? [];
  const reload = () => { mappings.reload(); postings.reload(); };

  async function save(kind: string, body: unknown) {
    setBusy(true);
    try { await api(kind, { body }); toast(tr("Tersimpan")); setModal(null); reload(); }
    catch (e) { err(e); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={[{ key: "mappings", label: tr("Pemetaan") }, { key: "postings", label: tr("Riwayat Posting") }]} value={tab} onChange={setTab} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setModal("mapping")}>+ Pemetaan</Button>
          <Button onClick={() => setModal("post")} disabled={!list.length}>{tr("Posting ke bisnis")}</Button>
        </div>
      </div>

      {tab === "mappings" && (mappings.error ? <ErrorBox message={mappings.error} onRetry={mappings.reload} /> : mappings.loading && !mappings.data ? <Loading /> : (
        <DataTable rows={list} caption={tr("Pemetaan jembatan")} empty={<Empty title={tr("Belum ada pemetaan")} hint={tr("Pemetaan menentukan akun kas dan akun lawan untuk modal, prive, atau reimburse.")} action={<Button onClick={() => setModal("mapping")}>+ Pemetaan</Button>} />} columns={[
          { key: "label", label: tr("Label") },
          { key: "direction", label: tr("Arah"), render: (r: any) => (r.direction === "personal_to_business" ? "Pribadi → Bisnis" : "Bisnis → Pemilik") },
          { key: "cashAccountName", label: tr("Akun kas") },
          { key: "coaName", label: tr("Akun lawan"), render: (r: any) => `${r.coaCode} ${r.coaName}` },
          { key: "personalCategory", label: tr("Kategori pribadi"), render: (r: any) => r.personalCategory ?? "—" },
        ]} />
      ))}

      {tab === "postings" && (postings.loading && !postings.data ? <Loading /> : (
        <DataTable rows={postings.data?.items ?? []} caption={tr("Riwayat posting jembatan")} empty={<Empty title={tr("Belum ada posting")} hint={tr("Setiap posting membentuk jurnal seimbang di buku bisnis.")} />} columns={[
          { key: "postedOn", label: tr("Tanggal"), render: (r: any) => fmtDate(r.postedOn) },
          { key: "label", label: tr("Pemetaan") },
          { key: "direction", label: tr("Arah"), render: (r: any) => (r.direction === "personal_to_business" ? "Masuk" : "Keluar") },
          { key: "amount", label: tr("Nominal"), right: true, render: (r: any) => <Money v={r.amount} /> },
          { key: "createdAt", label: tr("Dicatat"), render: (r: any) => fmtDateTime(r.createdAt) },
        ]} />
      ))}

      <Modal open={modal === "mapping"} onClose={() => setModal(null)} title={tr("Tambah pemetaan jembatan")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void save("/v6/bridge/mappings", { ...mForm, personalCategory: mForm.personalCategory || null })}>{tr("Simpan")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={tr("Label *")} value={mForm.label} onChange={(v) => setMForm((s) => ({ ...s, label: v }))} help={tr("Contoh: Setoran modal pemilik")} />
          <SelectField label={tr("Arah *")} value={mForm.direction} onChange={(v) => setMForm((s) => ({ ...s, direction: v }))} options={[{ value: "personal_to_business", label: tr("Pribadi → Bisnis (modal)") }, { value: "business_to_owner", label: tr("Bisnis → Pemilik (prive)") }]} />
          <SelectField label={tr("Akun kas/bisnis *")} value={mForm.cashAccountId} onChange={(v) => setMForm((s) => ({ ...s, cashAccountId: v }))} options={(accounts.data?.items ?? []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder={tr("Pilih akun…")} />
          <SelectField label={tr("Akun lawan (COA) *")} value={mForm.coaAccountId} onChange={(v) => setMForm((s) => ({ ...s, coaAccountId: v }))} options={(coa.data?.items ?? []).filter((a: any) => a.isActive).map((a: any) => ({ value: a.id, label: `${a.code} ${a.name}` }))} placeholder={tr("Pilih akun…")} />
          <TextField label={tr("Kategori pribadi")} value={mForm.personalCategory} onChange={(v) => setMForm((s) => ({ ...s, personalCategory: v }))} help={tr("Opsional: petunjuk pencocokan transaksi pribadi.")} />
        </div>
      </Modal>

      <Modal open={modal === "post"} onClose={() => setModal(null)} title={tr("Posting jembatan ke buku bisnis")} footer={<><Button variant="secondary" onClick={() => setModal(null)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void save("/v6/bridge/post", { ...pForm, note: pForm.note || null })}>{tr("Posting")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={tr("Pemetaan *")} value={pForm.mappingId} onChange={(v) => setPForm((s) => ({ ...s, mappingId: v }))} options={list.map((m: any) => ({ value: m.id, label: `${m.label} (${m.direction === "personal_to_business" ? "masuk" : "keluar"})` }))} placeholder={tr("Pilih pemetaan…")} />
          <TextField label={tr("Nominal *")} inputMode="decimal" value={pForm.amount} onChange={(v) => setPForm((s) => ({ ...s, amount: v.replace(/[^\d.]/g, "") }))} />
          <TextField label={tr("Tanggal *")} type="date" value={pForm.postedOn} onChange={(v) => setPForm((s) => ({ ...s, postedOn: v }))} />
          <TextField label={tr("Catatan")} value={pForm.note} onChange={(v) => setPForm((s) => ({ ...s, note: v }))} />
        </div>
        <p className="mt-3 text-xs text-ink-2">{tr("Posting membentuk jurnal seimbang (kas ↔ akun lawan) dan tidak mengubah data pribadi.")}</p>
      </Modal>
    </>
  );
}
