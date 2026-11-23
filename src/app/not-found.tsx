import Link from "next/link";
import { tr } from "@/lib/tr";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const metadata = { title: "Halaman tidak ditemukan — Business Flow" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
      <section className="w-full max-w-xl rounded-[24px] border border-line bg-white p-8 shadow-pop sm:p-10">
        <BrandLogo variant="mark" size="lg" />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">404 · Tidak ditemukan</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{tr("Halaman yang Anda cari tidak ada")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Alamat mungkin salah ketik, atau halaman sudah dipindahkan. Anda dapat kembali ke Dashboard atau membuka panduan penggunaan.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary-deep px-5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Ke Dashboard
          </Link>
          <Link
            href="/guide"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white px-5 text-sm font-semibold text-ink hover:bg-primary-bg"
          >
            Lihat Panduan
          </Link>
        </div>
      </section>
    </main>
  );
}
