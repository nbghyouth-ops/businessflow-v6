"use client";

import { tr } from "@/lib/tr";
import { BankReconPanel } from "@/components/bank-recon-panel";
import { PageHeader } from "@/components/ui";

export default function BankPage() {
  return (
    <>
      <PageHeader
        label={tr("Keuangan")}
        title={tr("Bank & Rekonsiliasi")}
        desc={tr("Catat mutasi rekening hasil impor, klasifikasikan menurut keputusan Anda, lalu cocokkan dengan settlement atau referensi pembayaran. Aplikasi tidak memindahkan dana.")}
      />
      <BankReconPanel />
    </>
  );
}
