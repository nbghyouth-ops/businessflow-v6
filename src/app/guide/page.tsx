import Link from "next/link";
import { tr } from "@/lib/tr";
import { GuideContent } from "@/components/guide";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const metadata = { title: "Panduan Memulai — Business Flow" };

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between"><BrandLogo variant="full" size="md" /><Link href="/" className="text-sm font-semibold text-primary-deep">← Kembali</Link></div>
      <h1 className="text-[30px] font-bold text-ink">{tr("Panduan Memulai Business Flow")}</h1>
      <p className="mb-6 mt-2 text-sm text-ink-2">{tr("Panduan ini hanya menjelaskan fitur yang tersedia saat ini, langkah demi langkah.")}</p>
      <GuideContent />
      <div className="mt-8"><Link href="/onboarding" className="inline-flex min-h-[44px] items-center rounded-xl bg-primary-deep px-5 text-sm font-semibold text-white">{tr("Mulai Siapkan Bisnis")}</Link></div>
    </main>
  );
}
