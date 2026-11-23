"use client";

import { tr } from "@/lib/tr";
import { ForecastPanel } from "@/components/v6-panels-2";
import { PageHeader } from "@/components/ui";

export default function ForecastPage() {
  return (
    <>
      <PageHeader
        label={tr("Laporan")}
        title={tr("Prakiraan Arus Kas")}
        desc={tr("Proyeksi mingguan dari saldo kas nyata, faktur belum lunas, tagihan supplier, dan rata-rata beban 56 hari terakhir.")}
      />
      <ForecastPanel />
    </>
  );
}
