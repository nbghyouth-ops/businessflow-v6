"use client";

import { tr } from "@/lib/tr";
import { PersonalPanel } from "@/components/v6-panels";
import { PageHeader } from "@/components/ui";

export default function PersonalPage() {
  return (
    <>
      <PageHeader
        label={tr("Pemilik")}
        title={tr("Keuangan Pribadi")}
        desc={tr("Ruang data terpisah dari bisnis: akun, transaksi, anggaran, dan tujuan tabungan pribadi. Tidak pernah muncul pada laporan usaha.")}
      />
      <PersonalPanel />
    </>
  );
}
