import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DownloadProgressProvider } from "@/components/download-loader";
import { BrowserCapabilityNotice, NoscriptNotice } from "@/components/fallback/boundaries";
import "./globals.css";

// Ikon/favicon/OG: berkas konvensi Next di `src/app/` (icon.png, apple-icon.png,
// favicon.ico, opengraph-image.png, twitter-image.png) — semuanya berasal dari paket
// aset merek Business Flow (lihat `src/components/brand/brand-config.ts`).
export const metadata: Metadata = {
  // Judul halaman sudah menuliskan "— Business Flow" sendiri (pola lama dipertahankan);
  // template judul tidak dipasang agar tidak menjadi "... · Business Flow · Business Flow".
  title: "Business Flow",
  description: "Platform pengelolaan bisnis terpadu: keuangan, penjualan, stok, klien, dan operasional.",
  applicationName: "Business Flow",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Business Flow",
    description: "Platform pengelolaan bisnis terpadu: keuangan, penjualan, stok, klien, dan operasional.",
    siteName: "Business Flow",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "var(--color-accent)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <NoscriptNotice />
        <BrowserCapabilityNotice />
        <DownloadProgressProvider>{children}</DownloadProgressProvider>
      </body>
    </html>
  );
}
