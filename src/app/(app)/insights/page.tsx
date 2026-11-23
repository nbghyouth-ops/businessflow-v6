"use client";

import { tr } from "@/lib/tr";
import { BiPanel } from "@/components/v6-panels-2";
import { PageHeader } from "@/components/ui";

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        label={tr("Laporan")}
        title={tr("Intelijen Bisnis")}
        desc={tr("Laba rugi, margin, piutang/utang, produk dan klien teratas — seluruhnya dihitung dari jurnal dan faktur, bukan angka contoh.")}
      />
      <BiPanel />
    </>
  );
}
