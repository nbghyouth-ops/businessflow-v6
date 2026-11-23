"use client";
import { tr } from "@/lib/tr";
import { ResourcePage } from "@/components/resource-page";
import { PageHeader } from "@/components/ui";

export default function Marketing() {
  return (
    <>
      <PageHeader label={tr("Management")} title={tr("Pemasaran")} desc={tr("Catatan kampanye, kanal, anggaran, dan hasil yang dicatat manual. Sistem tidak menghitung konversi atau ROI karena tidak ada sumber data otomatis.")} />
      <ResourcePage resource="campaigns" />
    </>
  );
}
