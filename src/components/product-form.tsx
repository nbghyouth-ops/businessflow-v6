"use client";

import { tr } from "@/lib/tr";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, ErrorBox, Loading, SelectField, TextField } from "@/components/ui";
import { api, newKey, toast } from "@/lib/client";

type Product = {
  id?: string;
  sku: string;
  barcode: string;
  name: string;
  kind: string;
  category: string;
  unit: string;
  price: string;
  trackStock: boolean;
  reorderLevel: string;
  isActive: boolean;
};

const EMPTY: Product = {
  sku: "",
  barcode: "",
  name: "",
  kind: "product",
  category: "",
  unit: "pcs",
  price: "",
  trackStock: true,
  reorderLevel: "0",
  isActive: true,
};

/** Form produk halaman penuh (dipakai /products/new dan /products/:id/edit). */
export function ProductForm({ id }: { id?: string }) {
  const biz = useBiz();
  const router = useRouter();
  const [f, setF] = useState<Product>(EMPTY);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [key] = useState(() => newKey());

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<{ item: Product }>(`/r/products/${id}`)
      .then((r) => {
        if (!alive) return;
        const p = r.item;
        setF({
          ...EMPTY,
          ...p,
          price: String(p.price ?? ""),
          reorderLevel: String(p.reorderLevel ?? "0"),
        });
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const set = (k: keyof Product) => (v: string) =>
    setF((x) => ({ ...x, [k]: k === "trackStock" || k === "isActive" ? v === "true" : v }));

  async function save() {
    setErr("");
    if (!f.sku.trim() || !f.name.trim()) return setErr("SKU dan nama wajib diisi.");
    if (!/^\d{1,15}(\.\d{1,2})?$/.test(f.price)) return setErr("Harga jual harus angka (maks 2 desimal).");
    setBusy(true);
    try {
      const body = {
        sku: f.sku.trim(),
        barcode: f.barcode || undefined,
        name: f.name.trim(),
        kind: f.kind,
        category: f.category || undefined,
        unit: f.unit || "pcs",
        price: f.price,
        trackStock: f.trackStock,
        reorderLevel: f.reorderLevel || "0",
        isActive: f.isActive,
      };
      if (id) await api(`/r/products/${id}`, { method: "PATCH", body });
      else await api("/r/products", { idem: key, body });
      toast(id ? "Produk diperbarui" : "Produk dibuat");
      router.push("/products");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!biz.can("inventory:write")) return <ErrorBox message={tr("Perangkat ini tidak memiliki izin menulis produk.")} />;
  if (error) return <ErrorBox message={error} />;
  if (loading) return <Loading />;

  return (
    <Card
      title={id ? "Ubah Produk" : "Produk Baru"}
      desc={tr("Halaman penuh untuk entri katalog. Layanan tidak melacak stok; varian dicatat sebagai SKU terpisah.")}
      actions={<Badge tone={f.isActive ? "good" : "warn"}>{f.isActive ? "Aktif" : "Nonaktif"}</Badge>}
    >
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField label={tr("SKU")} value={f.sku} onChange={set("sku")} required />
        <TextField label={tr("Barcode")} value={f.barcode} onChange={set("barcode")} />
        <TextField label={tr("Nama")} value={f.name} onChange={set("name")} required />
        <SelectField
          label={tr("Jenis")}
          value={f.kind}
          onChange={set("kind")}
          options={[
            { value: "product", label: tr("Produk") },
            { value: "service", label: tr("Layanan") },
          ]}
        />
        <TextField label={tr("Kategori")} value={f.category} onChange={set("category")} />
        <TextField label={tr("Satuan")} value={f.unit} onChange={set("unit")} />
        <TextField label={tr("Harga jual")} inputMode="decimal" value={f.price} onChange={set("price")} required />
        <TextField label={tr("Batas reorder")} inputMode="decimal" value={f.reorderLevel} onChange={set("reorderLevel")} />
        <SelectField
          label={tr("Lacak stok")}
          value={String(f.trackStock)}
          onChange={set("trackStock")}
          options={[
            { value: "true", label: "Ya" },
            { value: "false", label: tr("Tidak (layanan)") },
          ]}
        />
        <SelectField
          label={tr("Status")}
          value={String(f.isActive)}
          onChange={set("isActive")}
          options={[
            { value: "true", label: tr("Aktif") },
            { value: "false", label: tr("Nonaktif") },
          ]}
        />
        {err && (
          <p role="alert" className="md:col-span-2 rounded-lg bg-[var(--color-danger-bg-alt)] px-3 py-2 text-sm text-[var(--color-danger-deep)]">
            {err}
          </p>
        )}
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" loading={busy} disabled={!f.sku || !f.name || !f.price}>
            {id ? "Simpan perubahan" : "Buat produk"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/products")}>
            Batal
          </Button>
        </div>
      </form>
    </Card>
  );
}
