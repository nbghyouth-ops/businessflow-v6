import { redirect } from "next/navigation";

/**
 * Alias PRD v6.0 (A.6): Analitik Marketplace. Sejak R11-C layar nyatanya adalah
 * laporan Performa Penjualan Marketplace berbasis berkas impor (bukan tab lama).
 */
export default function MarketplaceReportsAlias() {
  redirect("/reports/marketplace-performance");
}
