"use client";

import { tr } from "@/lib/tr";
import { BridgePanel } from "@/components/v6-panels";
import { PageHeader } from "@/components/ui";

export default function BridgePage() {
  return (
    <>
      <PageHeader
        label={tr("Pemilik")}
        title={tr("Jembatan Pemilik ↔ Bisnis")}
        desc={tr("Pemetaan eksplisit untuk modal, prive, dan reimburse. Setiap posting membentuk jurnal seimbang di buku bisnis tanpa menyentuh data pribadi.")}
      />
      <BridgePanel />
    </>
  );
}
