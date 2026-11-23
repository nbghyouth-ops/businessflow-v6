"use client";

import { tr } from "@/lib/tr";
import { LearningPanel } from "@/components/v6-panels-2";
import { PageHeader } from "@/components/ui";

export default function LearnPage() {
  return (
    <>
      <PageHeader
        label={tr("Bantuan")}
        title={tr("Pembelajaran")}
        desc={tr("Materi singkat berbasis alur kerja nyata: kas vs laba, faktur, ledger stok, biaya marketplace, pemisahan pribadi, dan prakiraan.")}
      />
      <LearningPanel />
    </>
  );
}
