"use client";

import { tr } from "@/lib/tr";
import { RfqPanel } from "@/components/v6-panels-2";
import { PageHeader } from "@/components/ui";

export default function RfqPage() {
  return (
    <>
      <PageHeader
        label={tr("Penjualan")}
        title={tr("Permintaan Penawaran (RFQ)")}
        desc={tr("Catat permintaan klien, kirim kutipan bernomor, dan rekam keputusan. Satu kutipan diterima; sisanya otomatis ditolak.")}
      />
      <RfqPanel />
    </>
  );
}
