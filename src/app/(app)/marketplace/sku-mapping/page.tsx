"use client";

import { tr } from "@/lib/tr";
import { SkuMappingPanel } from "@/components/sku-mapping-panel";
import { PageHeader } from "@/components/ui";

export default function SkuMappingPage() {
  return (
    <>
      <PageHeader
        label={tr("Marketplace")}
        title={tr("Pemetaan SKU")}
        desc={tr("Hubungkan SKU marketplace ke produk internal agar laporan produk memakai SKU milik Anda. Tidak ada sinkronisasi stok ke marketplace.")}
      />
      <SkuMappingPanel canWrite />
    </>
  );
}
