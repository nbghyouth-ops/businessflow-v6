"use client";
 
import { tr } from "@/lib/tr";
import { useState } from "react";
import Link from "next/link";
import { ResourcePage } from "@/components/resource-page";
import { StockCountPanel, StockTransferPanel } from "@/components/p2-panels";
import { BatchWastePanel, RecipeProductionPanel } from "@/components/prd-panels";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, newKey, toast, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export default function Products() {
  const [tab, setTab] = useState("catalog");
  return (
    <>
      <PageHeader label={tr("Business Operations")} title={tr("Produk & Stok")} desc={tr("Stok berasal dari ledger pergerakan append-only; biaya memakai rata-rata bergerak.")} />
      <Tabs tabs={[{ key: "catalog", label: tr("Katalog") }, { key: "stock", label: tr("Stok & Nilai") }, { key: "moves", label: tr("Ledger Pergerakan") }, { key: "transfer", label: tr("Transfer Gudang") }, { key: "opname", label: tr("Stock Opname") }, { key: "batch", label: tr("Batch & Waste") }, { key: "prod", label: tr("Resep & Produksi") }]} value={tab} onChange={setTab} />
      {tab === "catalog" && (
        <ResourcePage
          resource="products"
          hint={tr("Layanan tidak melacak stok. Varian (ukuran/warna) dicatat sebagai SKU terpisah.")}
          rowLink={(row: any) => <Link href={`/products/${row.id}/edit`} className="text-primary-deep hover:underline">{row.name}</Link>}
          toolbar={<Link href="/products/new" className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-surface">{tr("Halaman produk baru →")}</Link>}
        />
      )}
      {tab === "stock" && <Stock />}
      {tab === "moves" && <Moves />}
      {tab === "transfer" && <StockTransferPanel />}
      {tab === "opname" && <StockCountPanel />}
      {tab === "batch" && <BatchWastePanel />}
      {tab === "prod" && <RecipeProductionPanel />}
    </>
  );
}

function Stock() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/inventory/stock");
  const [adj, setAdj] = useState<any | null>(null);
  const [f, setF] = useState({ direction: "in", quantity: "", reason: "adjustment", unitCost: "", note: "" });
  const [err, setErr] = useState(""); const [key, setKey] = useState(newKey());
  async function save() {
    setErr("");
    try { await api("/inventory/adjust", { idem: key, body: { productId: adj.id, direction: f.direction, quantity: f.quantity, reason: f.direction === "out" ? "adjustment" : f.reason, unitCost: f.unitCost || undefined, note: f.note || undefined } }); toast(tr("Stok disesuaikan")); setAdj(null); setKey(newKey()); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const total = data.items.reduce((s: number, i: any) => s + Number(i.value), 0);
  return (
    <Card title={tr("Stok & Nilai Persediaan")} desc={tr("Hanya produk yang melacak stok.")}>
      <DataTable rows={data.items} caption={tr("Stok")} empty={<Empty title={tr("Belum ada produk berstok")} hint={tr("Tambahkan produk di tab Katalog, lalu catat stok awal di sini atau lewat Pembelian.")} />}
        columns={[{ key: "sku", label: tr("SKU") }, { key: "name", label: tr("Produk") }, { key: "onHand", label: tr("Stok"), right: true, render: (i: any) => <span>{Number(i.onHand)} {i.unit} {Number(i.reorderLevel) > 0 && Number(i.onHand) <= Number(i.reorderLevel) && <Badge tone="warn">{tr("Reorder")}</Badge>}</span> }, { key: "avgCost", label: tr("Biaya rata-rata"), right: true, render: (i: any) => formatMoney(i.avgCost, biz.currency) }, { key: "value", label: tr("Nilai"), right: true, render: (i: any) => formatMoney(i.value, biz.currency) }, { key: "a", label: "", render: (i: any) => biz.can("inventory:write") ? <Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => { setAdj(i); setErr(""); setF({ direction: "in", quantity: "", reason: Number(i.onHand) === 0 ? "opening" : "adjustment", unitCost: "", note: "" }); }}>{tr("Sesuaikan")}</Button> : null }]} />
      {data.items.length > 0 && <p className="mt-3 text-right text-sm font-semibold">Total nilai persediaan: {formatMoney(total, biz.currency)}</p>}
      <Modal open={!!adj} onClose={() => setAdj(null)} title={`Penyesuaian stok — ${adj?.name ?? ""}`}>
        <div className="grid gap-3">
          <SelectField label={tr("Arah")} value={f.direction} onChange={(v) => setF({ ...f, direction: v })} options={[{ value: "in", label: tr("Tambah stok") }, { value: "out", label: tr("Kurangi stok (rusak/hilang/limbah)") }]} />
          {f.direction === "in" && <SelectField label={tr("Alasan")} value={f.reason} onChange={(v) => setF({ ...f, reason: v })} options={[{ value: "opening", label: tr("Stok awal") }, { value: "adjustment", label: tr("Koreksi hasil hitung") }]} />}
          <TextField label={tr("Kuantitas")} inputMode="decimal" value={f.quantity} onChange={(v) => setF({ ...f, quantity: v.replace(/[^\d.]/g, "") })} />
          {f.direction === "in" && <TextField label={tr("Biaya per satuan")} inputMode="decimal" value={f.unitCost} onChange={(v) => setF({ ...f, unitCost: v.replace(/[^\d.]/g, "") })} help={tr("Wajib untuk stok awal. Hanya isi bila nilainya diketahui.")} />}
          <TextField label={tr("Catatan")} value={f.note} onChange={(v) => setF({ ...f, note: v })} />
          {err && <p role="alert" className="text-sm text-[var(--color-danger-strong)]">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdj(null)}>{tr("Batal")}</Button><Button onClick={save} disabled={!f.quantity}>{tr("Simpan")}</Button></div>
        </div>
      </Modal>
    </Card>
  );
}

function Moves() {
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>("/inventory/movements");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const L: Record<string, string> = { purchase_receipt: "Penerimaan pembelian", sale: "Penjualan", sale_reversal: "Retur penjualan", adjustment: "Penyesuaian", opening: "Stok awal" };
  return (
    <Card title={tr("Ledger Pergerakan Stok")} desc="200 pergerakan terakhir. Tidak dapat diubah atau dihapus.">
      <DataTable rows={data.items} caption={tr("Pergerakan stok")} empty={<Empty title={tr("Belum ada pergerakan stok")} />} columns={[{ key: "createdAt", label: tr("Waktu"), render: (m: any) => fmtDateTime(m.createdAt) }, { key: "productName", label: tr("Produk") }, { key: "kind", label: tr("Jenis"), render: (m: any) => L[m.kind] ?? m.kind }, { key: "quantity", label: tr("Qty"), right: true, render: (m: any) => <span className={Number(m.quantity) < 0 ? "text-[var(--color-danger-strong)]" : ""}>{Number(m.quantity)}</span> }, { key: "unitCost", label: tr("Biaya satuan"), right: true, render: (m: any) => formatMoney(m.unitCost, biz.currency) }, { key: "warehouseName", label: tr("Gudang") }]} />
    </Card>
  );
}
