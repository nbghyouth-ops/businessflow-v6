"use client";

import { tr } from "@/lib/tr";
import { DocumentsPanel } from "@/components/documents-panel";
import { PageHeader } from "@/components/ui";

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        label={tr("Penjualan")}
        title={tr("Dokumen Bernomor")}
        desc={tr("Faktur, penawaran, kuitansi, dan surat jalan bernomor tanpa celah. PDF dirender di server memakai identitas bisnis Anda. Dokumen tetap setelah terbit; koreksi lewat pembatalan bertanda atau dokumen pengganti.")}
      />
      <DocumentsPanel />
    </>
  );
}
