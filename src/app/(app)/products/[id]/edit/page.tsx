"use client";

import { tr } from "@/lib/tr";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product-form";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <PageHeader label={tr("Katalog")} title={tr("Ubah Produk")} desc={tr("Perubahan berlaku untuk transaksi berikutnya; riwayat tidak diubah.")} />
      <ProductForm id={String(params?.id ?? "")} />
    </>
  );
}
