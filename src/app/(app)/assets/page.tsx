"use client";
 
import { tr } from "@/lib/tr";
import { useState } from "react";
import { FixedAssetDepPanel } from "@/components/prd-panels";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { PageHeader, Tabs } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export default function Assets() {
  const biz = useBiz();
  const [tab, setTab] = useState("fixed");
  const extra = [{ key: "dep", label: tr("Estimasi/bln"), right: true, render: (r: any) => Number(r.cost) > 0 && r.usefulLifeMonths ? formatMoney(Math.round(Number(r.cost) / r.usefulLifeMonths), biz.currency) : "—" }];
  return (
    <>
      <PageHeader label={tr("Management")} title={tr("Aset & Penyusutan")} desc={tr("Register aset tetap dengan perhitungan penyusutan periodik serta catatan aset operasional.")} />
      <Tabs tabs={[{ key: "fixed", label: tr("Aset Tetap & Penyusutan") }, { key: "list", label: tr("Daftar Aset Umum") }]} value={tab} onChange={setTab} />
      {tab === "fixed" ? <FixedAssetDepPanel /> : <ResourcePage resource="assets" extraColumns={extra} />}
    </>
  );
}
