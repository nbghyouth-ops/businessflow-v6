"use client";

import { tr } from "@/lib/tr";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product-form";

export default function NewProductPage() {
  return (
    <>
      <PageHeader label={tr("Katalog")} title={tr("Produk Baru")} desc={tr("Entri katalog halaman penuh: SKU, harga, stok, dan status.")} />
      <ProductForm />
    </>
  );
}
