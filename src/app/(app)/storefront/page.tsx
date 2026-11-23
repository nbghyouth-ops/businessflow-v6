"use client";

import { tr } from "@/lib/tr";
import { StorefrontPanel } from "@/components/v6-panels-2";
import { PageHeader } from "@/components/ui";

export default function StorefrontPage() {
  return (
    <>
      <PageHeader
        label={tr("Penjualan")}
        title={tr("Etalase Online")}
        desc={tr("Katalog publik berisi produk aktif. Etalase hanya dapat dibuka setelah diterbitkan; halaman ini adalah katalog informasi baca-saja tanpa formulir pesanan.")}
      />
      <StorefrontPanel />
    </>
  );
}
