"use client";

import { tr } from "@/lib/tr";
import { MarketplacePanel } from "@/components/v6-panels";
import { PageHeader } from "@/components/ui";

export default function MarketplacePage() {
  return (
    <>
      <PageHeader
        label={tr("Penjualan")}
        title={tr("Marketplace Multi-Kanal")}
        desc={tr("Catat pesanan Shopee/Tokopedia/TikTok Shop, biaya platform, dan settlement. Settlement berjurnal agar pendapatan tidak dihitung dua kali.")}
      />
      <MarketplacePanel />
    </>
  );
}
