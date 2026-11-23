"use client";
 
import { tr } from "@/lib/tr";
import Link from "next/link";
import { useState } from "react";
import { BankReconPanel, CreditNotePanel } from "@/components/p2-panels";
import { QuickTx } from "@/components/quick-tx";
import { useConfirm } from "@/components/confirm-dialog";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { RecordOnlyNotice } from "@/components/record-only-notice";
import { api, fmtDate, toast, toInputDate, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

const TYPE_L: Record<string, string> = { income: "Pemasukan", expense: "Pengeluaran", transfer: "Transfer antar-akun" };

export default function Finance() {
  const biz = useBiz();
  const [tab, setTab] = useState("overview");
  const [qt, setQt] = useState(false);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const tabs = [{ key: "overview", label: tr("Akun Kas & Bank") }, { key: "tx", label: tr("Transaksi") }, { key: "ar", label: tr("Piutang & Utang") }, { key: "budget", label: tr("Anggaran") }, { key: "recon", label: tr("Rekonsiliasi Bank") }, { key: "cn", label: tr("Credit Note") }, { key: "journal", label: tr("Jurnal") }, { key: "coa", label: tr("Akun & Kategori") }, { key: "periods", label: tr("Periode") }];
  return (
    <>
      <PageHeader label={tr("Business Operations")} title={tr("Keuangan")} desc={tr("Semua transaksi menghasilkan jurnal berimbang. Transaksi yang diposting tidak dapat diubah — koreksi lewat pembalikan.")}
        actions={biz.can("finance:write") ? <Button onClick={() => setQt(true)}>+ Catat transaksi</Button> : undefined} />
      <RecordOnlyNotice className="mb-3" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "overview" && <Accounts key={tick} />}
      {tab === "tx" && <Transactions key={tick} onChange={bump} />}
      {tab === "ar" && <Receivables key={tick} onChange={bump} />}
      {tab === "budget" && <Budget />}
      {tab === "recon" && <BankReconPanel />}
      {tab === "cn" && <CreditNotePanel />}
      {tab === "journal" && <Journal key={tick} />}
      {tab === "coa" && <CoaCats />}
      {tab === "periods" && <Periods />}
      <QuickTx open={qt} onClose={() => setQt(false)} onDone={bump} />
    </>
  );
}

function Accounts() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/finance/cash-accounts");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", kind: "bank", openingBalance: "" });
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try { await api("/finance/cash-accounts", { body: f }); toast(tr("Akun ditambahkan")); setOpen(false); setF({ name: "", kind: "bank", openingBalance: "" }); reload(); } catch (e) { setErr((e as Error).message); }
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const items: any[] = data.items;
  const total = items.reduce((s, a) => s + Number(a.balance), 0);
  return (
    <Card title={tr("Akun Kas & Bank")} desc={tr("Saldo dihitung dari jurnal posted — bukan angka yang bisa diubah langsung.")} actions={biz.can("finance:write") ? <Button variant="secondary" onClick={() => setOpen(true)}>+ Tambah akun</Button> : undefined}>
      <DataTable rows={items} caption={tr("Akun kas dan bank")} columns={[{ key: "name", label: tr("Akun") }, { key: "kind", label: tr("Jenis"), render: (a: any) => <Badge>{a.kind}</Badge> }, { key: "balance", label: tr("Saldo"), right: true, render: (a: any) => formatMoney(a.balance, biz.currency) }]} empty={<Empty title={tr("Belum ada akun kas/bank")} />} />
      {items.length > 0 && <p className="mt-3 text-right text-sm font-semibold">Total: {formatMoney(total, biz.currency)}</p>}
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Tambah Akun Kas/Bank")}>
        <div className="grid gap-3">
          <TextField label={tr("Nama akun")} value={f.name} onChange={(v) => setF({ ...f, name: v })} />
          <SelectField label={tr("Jenis")} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "cash", label: tr("Kas") }, { value: "bank", label: tr("Bank") }]} />
          <TextField label={tr("Saldo awal (opsional)")} inputMode="decimal" value={f.openingBalance} onChange={(v) => setF({ ...f, openingBalance: v.replace(/[^\d.]/g, "") })} help={tr("Isi hanya jika nilainya diketahui. Dicatat sebagai jurnal saldo awal.")} />
          {err && <p role="alert" className="text-sm text-[var(--color-danger-strong)]">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>{tr("Batal")}</Button><Button onClick={save}>{tr("Simpan")}</Button></div>
        </div>
      </Modal>
    </Card>
  );
}

function Transactions({ onChange }: { onChange: () => void }) {
  const biz = useBiz();
  const [state, setState] = useState(""); const [type, setType] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const qs = new URLSearchParams({ ...(state && { state }), ...(type && { type }), ...(from && { from }), ...(to && { to }) }).toString();
  const { data, error, loading, reload } = useApi<any>(`/finance/transactions${qs ? "?" + qs : ""}`);
  const [reason, setReason] = useState<{ id: string } | null>(null);
  const [rtext, setRtext] = useState("");
  const act = async (id: string, a: "approve" | "reject") => { try { await api(`/finance/transactions/${id}/${a}`, { body: {} }); toast(a === "approve" ? "Disetujui & diposting" : "Ditolak"); reload(); onChange(); } catch (e) { toast((e as Error).message, "err"); } };
  const rev = async () => { try { await api(`/finance/transactions/${reason!.id}/reverse`, { body: { reason: rtext } }); toast(tr("Transaksi dibalik")); setReason(null); setRtext(""); reload(); onChange(); } catch (e) { toast((e as Error).message, "err"); } };
  return (
    <Card title={tr("Daftar Transaksi")} actions={null}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label={tr("Status")} value={state} onChange={setState} placeholder={tr("Semua")} options={["draft", "pending_approval", "approved", "posted", "rejected", "reversed"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />
        <SelectField label={tr("Jenis")} value={type} onChange={setType} placeholder={tr("Semua")} options={Object.entries(TYPE_L).map(([value, label]) => ({ value, label }))} />
        <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} /><TextField label={tr("Sampai")} type="date" value={to} onChange={setTo} />
      </div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable rows={data.items} caption={tr("Transaksi keuangan")} empty={<Empty title={tr("Belum ada transaksi")} hint={tr("Gunakan Transaksi Cepat untuk mencatat pemasukan, pengeluaran, atau transfer.")} />}
          columns={[
            { key: "txDate", label: tr("Tanggal"), render: (t: any) => fmtDate(t.txDate) }, { key: "number", label: tr("No.") },
            { key: "type", label: tr("Jenis"), render: (t: any) => TYPE_L[t.type] },
            { key: "info", label: tr("Kategori/Akun"), render: (t: any) => <span>{t.type === "transfer" ? `${t.accountName} → ${t.toAccountName}` : `${t.categoryName} · ${t.accountName}`}{t.note && <span className="block text-xs text-ink-2">{t.note}</span>}</span> },
            { key: "amount", label: tr("Nominal"), right: true, render: (t: any) => formatMoney(t.amount, biz.currency) },
            { key: "state", label: tr("Status"), render: (t: any) => <Badge status={t.state} /> },
            { key: "a", label: "", render: (t: any) => (
              <div className="flex justify-end gap-1.5">
                {t.state === "pending_approval" && biz.can("finance:approve") && <><Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => act(t.id, "approve")}>{tr("Setujui")}</Button><Button variant="danger" className="!min-h-[32px] !px-2" onClick={() => act(t.id, "reject")}>{tr("Tolak")}</Button></>}
                {t.state === "posted" && biz.can("finance:approve") && <Button variant="danger" className="!min-h-[32px] !px-2" onClick={() => setReason({ id: t.id })}>{tr("Balik")}</Button>}
              </div>) },
          ]} />)}
      <Modal open={!!reason} onClose={() => setReason(null)} title={tr("Balik Transaksi")}>
        <p className="mb-3 text-sm text-ink-2">Jurnal asli tidak dihapus; sistem membuat jurnal pembalik. Alasan wajib diisi dan dicatat di audit.</p>
        <TextField label={tr("Alasan")} value={rtext} onChange={setRtext} />
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setReason(null)}>{tr("Batal")}</Button><Button variant="danger" onClick={rev}>{tr("Balik transaksi")}</Button></div>
      </Modal>
    </Card>
  );
}

function PayModal({ target, kind, onClose, onDone }: { target: any | null; kind: "ar" | "ap"; onClose: () => void; onDone: () => void }) {
  const biz = useBiz();
  const accs = useApi<any>(target ? "/finance/cash-accounts" : null);
  const [acc, setAcc] = useState(""); const [amt, setAmt] = useState(""); const [err, setErr] = useState("");
  const list: any[] = (accs.data?.items ?? []).filter((a: any) => a.isActive);
  async function pay() {
    setErr("");
    try {
      await api(`/${kind === "ar" ? "sales/invoices" : "purchasing/bills"}/${target.id}/record-payment`, { body: { accountId: acc || list[0]?.id, amount: amt || target.outstanding } });
      toast(tr("Pembayaran dicatat")); setAmt(""); onClose(); onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal open={!!target} onClose={onClose} title={kind === "ar" ? "Catat Pelunasan Piutang" : "Bayar Tagihan Supplier"}>
      {target && <div className="grid gap-3">
        <p className="text-sm">{target.number} — sisa {formatMoney(target.outstanding, biz.currency)}</p>
        <SelectField label={tr("Akun pembayaran")} value={acc || list[0]?.id || ""} onChange={setAcc} options={list.map((a) => ({ value: a.id, label: a.name }))} />
        <TextField label={tr("Nominal")} inputMode="decimal" value={amt || String(Number(target.outstanding))} onChange={(v) => setAmt(v.replace(/[^\d.]/g, ""))} help={kind === "ar" ? "Mengurangi Piutang Usaha — bukan pendapatan baru." : "Mengurangi Utang Usaha — bukan beban baru."} />
        {err && <p role="alert" className="text-sm text-[var(--color-danger-strong)]">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{tr("Batal")}</Button><Button onClick={pay}>{tr("Catat pembayaran")}</Button></div>
      </div>}
    </Modal>
  );
}

function Receivables({ onChange }: { onChange: () => void }) {
  const biz = useBiz();
  const ar = useApi<any>("/finance/receivables"); const ap = useApi<any>("/finance/payables");
  const [pay, setPay] = useState<{ t: any; k: "ar" | "ap" } | null>(null);
  const done = () => { ar.reload(); ap.reload(); onChange(); };
  return (
    <div className="grid gap-6">
      <Card title={tr("Piutang Usaha")} desc={tr("Faktur penjualan yang belum lunas.")}>
        <DataTable rows={ar.data?.items ?? []} caption={tr("Piutang")} empty={<Empty title={tr("Tidak ada piutang")} />} columns={[{ key: "number", label: tr("Faktur") }, { key: "clientName", label: tr("Klien"), render: (r: any) => r.clientName ?? "—" }, { key: "dueDate", label: tr("Jatuh tempo"), render: (r: any) => fmtDate(r.dueDate) }, { key: "outstanding", label: tr("Sisa"), right: true, render: (r: any) => formatMoney(r.outstanding, biz.currency) }, { key: "a", label: "", render: (r: any) => biz.can("sales:write") ? <Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => setPay({ t: r, k: "ar" })}>{tr("Catat bayar")}</Button> : null }]} />
      </Card>
      <Card title={tr("Utang Usaha")} desc={tr("Tagihan supplier dari penerimaan barang.")}>
        <DataTable rows={ap.data?.items ?? []} caption={tr("Utang")} empty={<Empty title={tr("Tidak ada utang usaha")} />} columns={[{ key: "number", label: tr("Tagihan") }, { key: "supplierName", label: tr("Supplier") }, { key: "outstanding", label: tr("Sisa"), right: true, render: (r: any) => formatMoney(r.outstanding, biz.currency) }, { key: "a", label: "", render: (r: any) => biz.can("purchasing:write") ? <Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => setPay({ t: r, k: "ap" })}>{tr("Bayar")}</Button> : null }]} />
      </Card>
      <PayModal target={pay?.t ?? null} kind={pay?.k ?? "ar"} onClose={() => setPay(null)} onDone={done} />
    </div>
  );
}

function Budget() {
  const biz = useBiz();
  const [month, setMonth] = useState(toInputDate().slice(0, 7));
  const { data, error, loading, reload } = useApi<any>(`/finance/budgets?month=${month}`);
  const [edit, setEdit] = useState<Record<string, string>>({});
  async function save(categoryId: string) {
    try { await api("/finance/budgets", { body: { categoryId, month, amount: edit[categoryId] } }); toast(tr("Anggaran disimpan")); reload(); } catch (e) { toast((e as Error).message, "err"); }
  }
  return (
    <Card title={tr("Anggaran per Kategori Beban")} desc={tr("Realisasi dihitung dari transaksi pengeluaran yang diposting.")}>
      <div className="mb-4 max-w-xs"><TextField label={tr("Bulan")} type="month" value={month} onChange={setMonth} /></div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable rows={data.items} caption={tr("Anggaran")} empty={<Empty title={tr("Belum ada kategori beban")} />} columns={[
          { key: "name", label: tr("Kategori") },
          { key: "budget", label: tr("Anggaran"), right: true, render: (r: any) => biz.can("finance:write") ? <span className="inline-flex items-center gap-2"><input aria-label={`Anggaran ${r.name}`} className="field-input !min-h-[34px] !w-36 text-right" inputMode="decimal" value={edit[r.categoryId] ?? String(Number(r.budget))} onChange={(e) => setEdit({ ...edit, [r.categoryId]: e.target.value.replace(/[^\d.]/g, "") })} /><Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => save(r.categoryId)}>{tr("Simpan")}</Button></span> : formatMoney(r.budget, biz.currency) },
          { key: "actual", label: tr("Realisasi"), right: true, render: (r: any) => formatMoney(r.actual, biz.currency) },
          { key: "use", label: tr("Pemakaian"), right: true, render: (r: any) => Number(r.budget) > 0 ? <Badge tone={Number(r.actual) > Number(r.budget) ? "bad" : "good"}>{Math.round((Number(r.actual) / Number(r.budget)) * 100)}%</Badge> : "—" },
        ]} />)}
    </Card>
  );
}

function Journal() {
  const { data, error, loading, reload } = useApi<any>("/finance/journal?limit=60");
  const biz = useBiz();
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data.items.length) return <Empty title={tr("Belum ada jurnal")} hint={tr("Jurnal dibuat otomatis oleh transaksi, penjualan, pembelian, dan penyesuaian.")} />;
  return (
    <div className="grid gap-3">
      {data.items.map((j: any) => (
        <Card key={j.id} className="!p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold">{j.number} · {fmtDate(j.entryDate)}</span><span className="flex items-center gap-2"><Badge tone="info">{j.source}</Badge><Badge status={j.status} /></span></div>
          <p className="mb-2 text-xs text-ink-2">{j.memo}</p>
          <table className="w-full text-sm"><tbody>{(j.lines ?? []).map((l: any, i: number) => <tr key={i} className="border-t border-divider"><td className="py-1.5">{l.code} {l.name}</td><td className="r py-1.5 text-right tnum">{Number(l.debit) > 0 ? formatMoney(l.debit, biz.currency) : ""}</td><td className="py-1.5 text-right tnum">{Number(l.credit) > 0 ? formatMoney(l.credit, biz.currency) : ""}</td></tr>)}</tbody></table>
        </Card>))}
    </div>
  );
}

function CoaCats() {
  const biz = useBiz();
  const coa = useApi<any>("/finance/coa"); const cats = useApi<any>("/finance/categories");
  const [f, setF] = useState({ kind: "expense", name: "" });
  async function add() { try { await api("/finance/categories", { body: f }); toast(tr("Kategori ditambahkan")); setF({ ...f, name: "" }); cats.reload(); coa.reload(); } catch (e) { toast((e as Error).message, "err"); } }
  async function toggle(c: any) { try { await api(`/finance/categories/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } }); cats.reload(); } catch (e) { toast((e as Error).message, "err"); } }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={tr("Kategori Transaksi")} desc={tr("Kategori yang pernah dipakai tidak dihapus, hanya dinonaktifkan.")}>
        {biz.can("finance:write") && <div className="mb-4 grid gap-2 sm:grid-cols-[130px_1fr_auto]"><SelectField label={tr("Jenis")} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "income", label: tr("Pemasukan") }, { value: "expense", label: tr("Pengeluaran") }]} /><TextField label={tr("Nama")} value={f.name} onChange={(v) => setF({ ...f, name: v })} /><div className="self-end"><Button onClick={add} disabled={!f.name.trim()}>{tr("Tambah")}</Button></div></div>}
        <DataTable rows={cats.data?.items ?? []} caption={tr("Kategori")} columns={[{ key: "name", label: tr("Nama") }, { key: "kind", label: tr("Jenis"), render: (c: any) => TYPE_L[c.kind] }, { key: "accountName", label: tr("Akun COA"), render: (c: any) => `${c.code} ${c.accountName}` }, { key: "a", label: "", render: (c: any) => biz.can("finance:write") ? <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => toggle(c)}>{c.isActive ? "Nonaktifkan" : "Aktifkan"}</Button> : null }]} />
      </Card>
      <Card title={tr("Bagan Akun (COA)")}>
        <DataTable rows={coa.data?.items ?? []} caption={tr("Bagan akun")} columns={[{ key: "code", label: tr("Kode") }, { key: "name", label: tr("Nama") }, { key: "type", label: tr("Tipe"), render: (a: any) => <Badge>{a.type}</Badge> }]} />
      </Card>
    </div>
  );
}

function Periods() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/finance/periods");
  const { confirm, ConfirmUI } = useConfirm();
  const [f, setF] = useState({ startDate: "", endDate: "" }); const [err, setErr] = useState("");
  async function close() {
    if (!(await confirm({ title: tr("Tutup Periode Akuntansi"), message: tr("Tutup periode ini? Jurnal baru dengan tanggal di dalam rentang akan ditolak."), confirmLabel: "Tutup Periode" }))) return;
    setErr("");
    try { await api("/finance/periods/close", { body: f }); toast(tr("Periode ditutup")); reload(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Card title={tr("Periode Akuntansi")} desc={tr("Menutup periode mengunci tanggal tersebut dari jurnal baru (period lock).")}>
      {biz.can("finance:approve") && (
        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><TextField label={tr("Mulai")} type="date" value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} /><TextField label={tr("Selesai")} type="date" value={f.endDate} onChange={(v) => setF({ ...f, endDate: v })} /><div className="self-end"><Button variant="danger" onClick={close} disabled={!f.startDate || !f.endDate}>{tr("Tutup periode")}</Button></div></div>)}
      {err && <p role="alert" className="mb-3 text-sm text-[var(--color-danger-strong)]">{err}</p>}
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : <DataTable rows={data.items} caption={tr("Periode")} empty={<Empty title={tr("Belum ada periode")} />} columns={[{ key: "startDate", label: tr("Mulai"), render: (p: any) => fmtDate(p.startDate) }, { key: "endDate", label: tr("Selesai"), render: (p: any) => fmtDate(p.endDate) }, { key: "status", label: tr("Status"), render: (p: any) => <Badge status={p.status} tone={p.status === "closed" ? "bad" : "good"}>{p.status === "closed" ? "Ditutup" : "Terbuka"}</Badge> }]} />}
    </Card>
  );
}
