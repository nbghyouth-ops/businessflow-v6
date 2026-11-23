"use client";
 
import { tr } from "@/lib/tr";
import { useMemo, useState } from "react";
import { PosShiftTablePanel } from "@/components/prd-panels";
import { ReceiptExportModal } from "@/components/export-modal";
import { RecordOnlyNotice } from "@/components/record-only-notice";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField, statusLabel } from "@/components/ui";
import { useLang } from "@/components/lang-provider";
import { api, fmtDateTime, newKey, toast, useApi } from "@/lib/client";
import { useMemoryDraft } from "@/lib/draft-store";
import { formatMoney, fromCents, mulQty, percentOf, toCents } from "@/lib/money";

export default function Sales() {
  const biz = useBiz();
  const [tab, setTab] = useState(biz.can("sales:write") ? "pos" : "inv");
  const tabs = [
    ...(biz.can("sales:write") ? [{ key: "pos", label: tr("Kasir (POS)") }] : []),
    { key: "inv", label: tr("Faktur & Pembayaran") },
    { key: "quo", label: tr("Penawaran") },
    { key: "so", label: tr("Sales Order") },
    { key: "shift", label: tr("Shift & Meja") },
  ];
  return (
    <>
      <PageHeader
        label={tr("Business Operations")}
        title={tr("Penjualan & POS")}
        desc={tr("Catat penjualan: stok, jurnal, piutang, dan HPP dibuat server dalam satu transaksi database.")}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "pos" && <Pos />}
      {tab === "inv" && <Invoices />}
      {tab === "quo" && <Quotations />}
      {tab === "so" && <SalesOrders />}
      {tab === "shift" && <PosShiftTablePanel />}
    </>
  );
}

function Pos() {
  const biz = useBiz();
  const cur = biz.currency;
  const meta = useApi<any>("/sales/pos-meta");
  const prods = useApi<any>("/r/products?limit=500");
  const stock = useApi<any>(biz.can("inventory:read") ? "/inventory/stock" : null);
  const clients = useApi<any>(biz.can("crm:read") ? "/r/clients?limit=300" : null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useMemoryDraft<Record<string, string>>("pos:cart", {});
  const [client, setClient] = useState("");
  const [disc, setDisc] = useState("");
  const [acc, setAcc] = useState("");
  const [paid, setPaid] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey());
  const [receipt, setReceipt] = useState<any>(null);
  const [exportInv, setExportInv] = useState<{ id: string; number: string } | null>(null);

  const stockMap = useMemo(() => new Map<string, number>((stock.data?.items ?? []).map((s: any) => [s.id, Number(s.onHand)])), [stock.data]);
  const list: any[] = (prods.data?.items ?? []).filter(
    (p: any) => p.isActive && (!q || `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  const byId = new Map<string, any>((prods.data?.items ?? []).map((p: any) => [p.id, p]));
  const lines = Object.entries(cart).filter(([, v]) => Number(v) > 0);

  let subtotal = 0n;
  try {
    for (const [id, v] of lines) subtotal += mulQty(v, byId.get(id).price);
  } catch {
    /* input belum valid */
  }
  let d = 0n;
  try {
    d = disc ? toCents(disc) : 0n;
  } catch {
    /* abaikan */
  }
  const taxable = subtotal > d ? subtotal - d : 0n;
  const tax = percentOf(taxable, meta.data?.taxRate ?? "0");
  const total = taxable + tax;
  const payAmt = paid ?? fromCents(total).replace(/\.00$/, "");

  const add = (p: any) => setCart((c: Record<string, string>) => ({ ...c, [p.id]: String(Number(c[p.id] ?? 0) + 1) }));
  async function recordSale() {
    setErr("");
    if (!lines.length) return setErr("Keranjang kosong.");
    const accountId = acc || meta.data?.accounts?.[0]?.id;
    const amt = Number(payAmt || 0);
    setBusy(true);
    try {
      const r = await api<any>("/sales/record", {
        idem: key,
        body: {
          clientId: client || undefined,
          discount: disc || undefined,
          lines: lines.map(([productId, quantity]) => ({ productId, quantity })),
          payments: amt > 0 ? [{ accountId, amount: payAmt }] : [],
        },
      });
      setReceipt(r);
      setCart({});
      setDisc("");
      setPaid(null);
      setClient("");
      setKey(newKey());
      stock.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (prods.error) return <ErrorBox message={prods.error} onRetry={prods.reload} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card title={tr("Pilih produk")}>
        <div className="mb-3">
          <label className="sr-only" htmlFor="pq">
            Cari produk
          </label>
          <input
            id="pq"
            className="field-input"
            placeholder={tr("Cari nama, SKU, atau scan barcode…")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
        {prods.loading && !prods.data ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty title={tr("Belum ada produk")} hint={tr("Tambahkan produk di menu Produk & Stok terlebih dahulu.")} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => {
              const oh = p.trackStock && p.kind === "product" ? stockMap.get(p.id) : undefined;
              const out = oh !== undefined && oh <= 0;
              return (
                <li key={p.id}>
                  <button
                    disabled={out}
                    onClick={() => add(p)}
                    className="flex h-full w-full flex-col items-start rounded-2xl border border-line bg-white p-3 text-left transition-colors hover:bg-primary-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="text-xs text-ink-2">
                      {p.sku}
                      {oh !== undefined ? ` · stok ${oh}` : ""}
                    </span>
                    <span className="mt-1 text-sm font-bold tnum">{formatMoney(p.price, cur)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={tr("Keranjang")}>
        {lines.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-2">{tr("Ketuk produk untuk menambahkan.")}</p>
        ) : (
          <ul className="mb-3 grid gap-2">
            {lines.map(([id, v]) => (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{byId.get(id)?.name}</span>
                <input
                  aria-label={`Jumlah ${byId.get(id)?.name}`}
                  className="field-input !min-h-[34px] !w-20 text-right"
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => setCart({ ...cart, [id]: e.target.value.replace(/[^\d.]/g, "") })}
                />
                <button
                  aria-label={tr("Hapus dari keranjang")}
                  className="px-2 text-lg text-ink-2 hover:text-[var(--color-danger-error)]"
                  onClick={() =>
                    setCart((c: Record<string, string>) => {
                      const n = { ...c };
                      delete n[id];
                      return n;
                    })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 border-t border-divider pt-3">
          {clients.data && (
            <SelectField
              label={tr("Pelanggan (wajib bila belum lunas)")}
              value={client}
              onChange={setClient}
              placeholder={tr("Tanpa pelanggan")}
              options={clients.data.items.map((c: any) => ({ value: c.id, label: c.name }))}
            />
          )}
          <TextField label={tr("Diskon")} inputMode="decimal" value={disc} onChange={(v) => setDisc(v.replace(/[^\d.]/g, ""))} />
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt>{tr("Subtotal")}</dt>
            <dd className="text-right tnum">{formatMoney(fromCents(subtotal), cur)}</dd>
            <dt>Pajak ({meta.data?.taxRate ?? 0}%)</dt>
            <dd className="text-right tnum">{formatMoney(fromCents(tax), cur)}</dd>
            <dt className="font-bold">{tr("Total")}</dt>
            <dd className="text-right text-lg font-bold tnum">{formatMoney(fromCents(total), cur)}</dd>
          </dl>
          <SelectField
            label={tr("Akun pembayaran")}
            value={acc || meta.data?.accounts?.[0]?.id || ""}
            onChange={setAcc}
            options={(meta.data?.accounts ?? []).map((a: any) => ({ value: a.id, label: a.name }))}
          />
          <TextField
            label={tr("Dibayar di luar aplikasi")}
            inputMode="decimal"
            value={payAmt}
            onChange={(v) => setPaid(v.replace(/[^\d.]/g, ""))}
            help={tr("Kurangi/kosongkan untuk mencatat sisa sebagai piutang (butuh pelanggan).")}
          />
          {err && (
            <p role="alert" className="rounded-xl bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger-text)]">
              {err}
            </p>
          )}
          <Button loading={busy} disabled={!lines.length} onClick={recordSale} className="!min-h-[48px]">
            Catat penjualan
          </Button>
          <RecordOnlyNotice />
          <p className="text-xs text-ink-2">Angka di atas pratinjau; server menghitung ulang final.</p>
        </div>
      </Card>
      <ReceiptExportModal
        invoiceId={exportInv?.id ?? null}
        invoiceNumber={exportInv?.number}
        open={Boolean(exportInv)}
        onClose={() => setExportInv(null)}
      />
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title={tr("Transaksi berhasil")}>
        {receipt && (
          <div className="grid gap-2 text-sm">
            <p className="text-lg font-bold">{receipt.number}</p>
            <p>
              Total {formatMoney(receipt.total, cur)} · Dibayar {formatMoney(receipt.paid, cur)}
            </p>
            <p>
              Status: <Badge status={receipt.status} />
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setExportInv({ id: receipt.id, number: receipt.number });
                  setReceipt(null);
                }}
              >
                Unduh Struk
              </Button>
              <Button onClick={() => setReceipt(null)}>{tr("Transaksi baru")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Invoices() {
  const biz = useBiz();
  const lang = useLang();
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useApi<any>(`/sales/invoices${status ? `?status=${status}` : ""}`);
  const [sel, setSel] = useState<string | null>(null);
  const [exportInv, setExportInv] = useState<{ id: string; number: string } | null>(null);
  return (
    <Card title={tr("Faktur")}>
      <div className="mb-4 max-w-xs">
        <SelectField
          label={tr("Status")}
          value={status}
          onChange={setStatus}
          placeholder={tr("Semua")}
          options={["unpaid", "partial", "paid", "reversed"].map((s) => ({ value: s, label: statusLabel(lang, s) }))}
        />
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <DataTable
          rows={data.items}
          caption={tr("Faktur")}
          empty={<Empty title={tr("Belum ada faktur")} hint={tr("Faktur dibuat otomatis saat mencatat penjualan POS.")} />}
          columns={[
            { key: "number", label: tr("No.") },
            { key: "issuedAt", label: tr("Waktu"), render: (r: any) => fmtDateTime(r.issuedAt) },
            { key: "clientName", label: tr("Pelanggan"), render: (r: any) => r.clientName ?? "Umum" },
            { key: "total", label: tr("Total"), right: true, render: (r: any) => formatMoney(r.total, biz.currency) },
            { key: "paid", label: tr("Dibayar"), right: true, render: (r: any) => formatMoney(r.paid, biz.currency) },
            { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
            {
              key: "a",
              label: "",
              right: true,
              render: (r: any) => (
                <div className="flex justify-end gap-1">
                  <Button variant="secondary" className="!min-h-[32px] !px-2.5 text-xs" onClick={() => setExportInv({ id: r.id, number: r.number })}>
                    Unduh Struk
                  </Button>
                  <Button variant="ghost" className="!min-h-[32px] !px-2 text-xs" onClick={() => setSel(r.id)}>
                    Detail
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      <InvoiceModal id={sel} onClose={() => setSel(null)} onChange={reload} onExport={(v) => setExportInv(v)} />
      <ReceiptExportModal
        invoiceId={exportInv?.id ?? null}
        invoiceNumber={exportInv?.number}
        open={Boolean(exportInv)}
        onClose={() => setExportInv(null)}
      />
    </Card>
  );
}

function InvoiceModal({
  id,
  onClose,
  onChange,
  onExport,
}: {
  id: string | null;
  onClose: () => void;
  onChange: () => void;
  onExport: (v: { id: string; number: string }) => void;
}) {
  const biz = useBiz();
  const d = useApi<any>(id ? `/sales/invoices/${id}` : null);
  const accs = useApi<any>(id && biz.can("sales:write") ? "/sales/pos-meta" : null);
  const [acc, setAcc] = useState("");
  const [amt, setAmt] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const inv = d.data?.invoice;
  const out = inv ? Number(inv.total) - Number(inv.paid) : 0;
  async function pay() {
    setErr("");
    try {
      await api(`/sales/invoices/${id}/record-payment`, {
        idem: newKey(),
        body: { accountId: acc || accs.data?.accounts?.[0]?.id, amount: amt || String(out) },
      });
      toast(tr("Pembayaran dicatat"));
      setAmt("");
      d.reload();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function reverse() {
    setErr("");
    try {
      await api(`/sales/invoices/${id}/reverse`, { body: { reason } });
      toast(tr("Faktur dibalik (retur/refund penuh)"));
      setReason("");
      d.reload();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Modal open={!!id} onClose={onClose} title={inv ? `Faktur ${inv.number}` : "Faktur"} wide>
      {!inv ? (
        <Loading />
      ) : (
        <div className="grid gap-4">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => onExport({ id: inv.id, number: inv.number })}>
              Unduh Struk (PDF / JPG / PNG)
            </Button>
          </div>
          <DataTable
            rows={d.data.lines}
            caption={tr("Baris faktur")}
            columns={[
              { key: "description", label: tr("Item") },
              { key: "quantity", label: tr("Qty"), right: true, render: (l: any) => Number(l.quantity) },
              { key: "unitPrice", label: tr("Harga"), right: true, render: (l: any) => formatMoney(l.unitPrice, biz.currency) },
              { key: "lineTotal", label: tr("Jumlah"), right: true, render: (l: any) => formatMoney(l.lineTotal, biz.currency) },
            ]}
          />
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 text-sm">
            <dt>{tr("Subtotal")}</dt>
            <dd className="text-right tnum">{formatMoney(inv.subtotal, biz.currency)}</dd>
            <dt>{tr("Diskon")}</dt>
            <dd className="text-right tnum">{formatMoney(inv.discount, biz.currency)}</dd>
            <dt>{tr("Pajak")}</dt>
            <dd className="text-right tnum">{formatMoney(inv.tax, biz.currency)}</dd>
            <dt className="font-bold">{tr("Total")}</dt>
            <dd className="text-right font-bold tnum">{formatMoney(inv.total, biz.currency)}</dd>
            <dt>{tr("Dibayar")}</dt>
            <dd className="text-right tnum">{formatMoney(inv.paid, biz.currency)}</dd>
          </dl>
          <p className="text-sm">
            Status: <Badge status={inv.status} /> · {inv.operator ? `oleh ${inv.operator}` : ""}
          </p>
          {err && (
            <p role="alert" className="rounded-xl bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger-text)]">
              {err}
            </p>
          )}
          {(inv.status === "unpaid" || inv.status === "partial") && biz.can("sales:write") && (
            <div className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <SelectField
                label={tr("Akun")}
                value={acc || accs.data?.accounts?.[0]?.id || ""}
                onChange={setAcc}
                options={(accs.data?.accounts ?? []).map((a: any) => ({ value: a.id, label: a.name }))}
              />
              <TextField
                label={tr("Nominal")}
                inputMode="decimal"
                value={amt || String(out)}
                onChange={(v) => setAmt(v.replace(/[^\d.]/g, ""))}
              />
              <div className="self-end">
                <Button onClick={pay}>{tr("Catat pembayaran")}</Button>
              </div>
            </div>
          )}
          {inv.status !== "reversed" && biz.can("finance:approve") && (
            <div className="grid gap-2 rounded-2xl border border-[var(--color-coral-light)] p-3 sm:grid-cols-[1fr_auto]">
              <TextField
                label={tr("Retur/refund penuh — alasan")}
                value={reason}
                onChange={setReason}
                help={tr("Membalik jurnal penjualan & pembayaran dan mengembalikan stok.")}
              />
              <div className="self-end">
                <Button variant="danger" disabled={reason.trim().length < 3} onClick={reverse}>
                  Balik faktur
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Quotations() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/p2/quotations");
  const clients = useApi<any>(biz.can("crm:read") ? "/r/clients?limit=200" : null);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/p2/quotations", {
        body: {
          clientId: clientId || undefined,
          validUntil: validUntil || undefined,
          notes: notes || undefined,
          lines: [{ description: desc, qty: Number(qty || 1), unitPrice: unitPrice || "0", discount: "0" }],
        },
      });
      toast(tr("Penawaran dibuat"));
      setOpen(false);
      setDesc("");
      setUnitPrice("");
      setNotes("");
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function convert(id: string) {
    try {
      const res = await api<any>(`/p2/quotations/${id}/convert`, { body: {} });
      toast(`Dikonversi ke Sales Order ${res.number}`);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <Card
      title={tr("Penawaran Harga (Quotation)")}
      desc={tr("Buat penawaran untuk pelanggan lalu konversi langsung menjadi Sales Order.")}
      actions={biz.can("sales:write") ? <Button onClick={() => setOpen(true)}>+ Buat Penawaran</Button> : undefined}
    >
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <DataTable
          rows={data?.items ?? []}
          caption={tr("Daftar penawaran")}
          empty={<Empty title={tr("Belum ada penawaran")} hint={tr("Buat penawaran harga pertama Anda.")} />}
          columns={[
            { key: "number", label: tr("No. Penawaran") },
            { key: "validUntil", label: tr("Berlaku s.d."), render: (r: any) => r.validUntil || "—" },
            { key: "total", label: tr("Total"), right: true, render: (r: any) => formatMoney(fromCents(BigInt(r.total || "0")), biz.currency) },
            { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
            {
              key: "a",
              label: "",
              right: true,
              render: (r: any) =>
                biz.can("sales:write") && r.status !== "converted" ? (
                  <Button variant="secondary" className="!min-h-[32px] !px-2.5 text-xs" onClick={() => convert(r.id)}>
                    Konversi ke SO
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Buat Penawaran Baru")}>
        <div className="grid gap-3">
          {clients.data && (
            <SelectField
              label={tr("Pelanggan (opsional)")}
              value={clientId}
              onChange={setClientId}
              placeholder={tr("Umum")}
              options={clients.data.items.map((c: any) => ({ value: c.id, label: c.name }))}
            />
          )}
          <TextField label={tr("Item / Deskripsi")} value={desc} onChange={setDesc} placeholder={tr("Mis. Paket Jasa Desain")} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label={tr("Qty")} inputMode="decimal" value={qty} onChange={(v) => setQty(v.replace(/[^\d.]/g, ""))} />
            <TextField label={tr("Harga Satuan")} inputMode="decimal" value={unitPrice} onChange={(v) => setUnitPrice(v.replace(/[^\d.]/g, ""))} />
          </div>
          <TextField label={tr("Berlaku hingga")} type="date" value={validUntil} onChange={setValidUntil} />
          <TextField label={tr("Catatan")} value={notes} onChange={setNotes} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button loading={busy} disabled={!desc.trim() || !unitPrice} onClick={save}>
              Simpan Penawaran
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function SalesOrders() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/p2/sales-orders");
  return (
    <Card title={tr("Sales Order")} desc={tr("Pesanan penjualan yang dikonversi dari penawaran.")}>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <DataTable
          rows={data?.items ?? []}
          caption={tr("Daftar sales order")}
          empty={<Empty title={tr("Belum ada Sales Order")} hint={tr("Konversi penawaran di tab Penawaran untuk membuat Sales Order.")} />}
          columns={[
            { key: "number", label: tr("No. SO") },
            { key: "createdAt", label: tr("Tanggal"), render: (r: any) => fmtDateTime(r.createdAt) },
            { key: "total", label: tr("Total"), right: true, render: (r: any) => formatMoney(fromCents(BigInt(r.total || "0")), biz.currency) },
            { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
          ]}
        />
      )}
    </Card>
  );
}
