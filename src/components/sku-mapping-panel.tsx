"use client";

import { useState } from "react";
import { api, toast, useApi } from "@/lib/client";
import { tr } from "@/lib/tr";
import { Button, Card, DataTable, Empty, ErrorBox, Loading, SelectField } from "./ui";

/**
 * Pemetaan SKU marketplace → produk internal (R11-B2/2.4b).
 * Hanya menghubungkan label: tidak mengubah stok, HPP, atau menyinkronkan apa pun
 * ke marketplace. Usulan pencocokan deterministik = SKU identik (tanpa skor/AI).
 */
type Row = {
  channelId: string;
  channelName: string;
  sellerSku: string;
  lineCount: number;
  currency: string | null;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
};
type Overview = { items: Row[]; unmapped: number };
type Product = { id: string; name: string; sku: string | null };

export function SkuMappingPanel({ canWrite }: { canWrite: boolean }) {
  const overview = useApi<Overview>("/v6/marketplace/sku-mappings");
  const products = useApi<{ items: Product[] }>("/r/products?limit=200");
  const [picked, setPicked] = useState<Row | null>(null);
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = overview.data?.items ?? [];
  const productOptions = (products.data?.items ?? []).map((p) => ({
    value: p.id,
    label: `${p.name}${p.sku ? ` · ${p.sku}` : ""}`,
  }));
  /** Usulan deterministik: SKU internal sama persis dengan SKU marketplace. */
  const suggestion = (row: Row) =>
    productOptions.find((o) => o.label.toLowerCase().endsWith(` · ${row.sellerSku.toLowerCase()}`))?.value ?? "";

  function pick(row: Row, suggested: boolean) {
    setPicked(row);
    setProductId(row.productId ?? (suggested ? suggestion(row) : ""));
  }

  async function save() {
    if (!picked) return;
    if (!productId) return toast(tr("Pilih produk internal lebih dulu."), "err");
    setBusy(true);
    try {
      await api("/v6/marketplace/sku-mappings", {
        method: "PUT",
        body: { channelId: picked.channelId, externalSku: picked.sellerSku, productId },
      });
      toast(tr("Pemetaan SKU tersimpan"), "ok");
      setPicked(null);
      setProductId("");
      overview.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Tanpa judul kartu: PageHeader sudah menyebut nama layar, dan judul ganda
          persis sama membuat halaman terlihat berulang (temuan pemeriksaan visual). */}
      <Card>
        {overview.error ? (
          <ErrorBox message={overview.error} onRetry={overview.reload} />
        ) : overview.loading && !overview.data ? (
          <Loading />
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-2">
              {tr("SKU belum dipetakan: {n} dari {total}").replace("{n}", String(overview.data?.unmapped ?? 0)).replace("{total}", String(rows.length))}
            </p>
            <DataTable
              rows={rows}
              caption={tr("SKU marketplace dari impor Order Items")}
              empty={<Empty title={tr("Belum ada SKU marketplace")} hint={tr("SKU muncul di sini setelah impor Order Items yang memuat kolom SKU.")} />}
              columns={[
                { key: "channelName", label: tr("Kanal") },
                { key: "sellerSku", label: tr("SKU marketplace") },
                { key: "lineCount", label: tr("Dipakai di baris"), right: true },
                {
                  key: "status",
                  label: tr("Status"),
                  render: (r: Row) => (r.productId ? tr("Terpetakan") : tr("Belum dipetakan")),
                },
                { key: "productName", label: tr("Produk internal"), render: (r: Row) => r.productName ?? "—" },
                {
                  key: "act",
                  label: "",
                  render: (r: Row) =>
                    canWrite ? (
                      <Button variant={r.productId ? "ghost" : "secondary"} onClick={() => pick(r, true)}>
                        {r.productId ? tr("Ubah") : tr("Petakan")}
                      </Button>
                    ) : null,
                },
              ]}
            />
          </>
        )}
      </Card>

      {picked && canWrite && (
        <Card title={tr("Petakan {sku}").replace("{sku}", picked.sellerSku)} desc={picked.channelName}>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={tr("Produk internal *")}
              value={productId}
              onChange={setProductId}
              options={productOptions}
              placeholder={tr("Pilih produk internal")}
            />
            <div className="flex items-end gap-2">
              <Button loading={busy} disabled={!productId} onClick={() => void save()}>
                {tr("Simpan pemetaan")}
              </Button>
              <Button variant="ghost" onClick={() => setPicked(null)}>
                {tr("Batal")}
              </Button>
            </div>
          </div>
          {!productId && suggestion(picked) && (
            <p className="mt-2 text-xs text-ink-2">
              {tr("Usulan deterministik: SKU internal sama persis dengan SKU marketplace.")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
