"use client";

import { tr } from "@/lib/tr";
import { useParams } from "next/navigation";
import { useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

/**
 * Etalase publik (revisi F-08, prompt R7-C §1).
 *
 * Halaman ini adalah KATALOG INFORMASI baca-saja: nama produk, kategori, satuan,
 * harga acuan, dan kontak sebagai teks biasa. Tidak ada formulir peminat, keranjang,
 * pemesanan, atau apa pun yang menerima niat beli dari publik — aplikasi bukan
 * marketplace dan tidak memfasilitasi transaksi.
 */
export default function PublicStorefront() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug ?? "");
  const { data, error, loading } = useApi<any>(`/public/storefront/${slug}`);

  if (loading) return <main className="mx-auto max-w-3xl p-8"><p role="status" className="text-sm text-ink-2">{tr("Memuat etalase...")}</p></main>;
  if (error || !data) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold text-ink">{tr("Etalase tidak tersedia")}</h1>
        <p className="mt-2 text-sm text-ink-2">{error ?? "Etalase belum diterbitkan atau alamatnya salah."}</p>
      </main>
    );
  }

  const item = data.item;
  const products: any[] = data.products ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="rounded-[24px] bg-[var(--color-accent)] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-on-accent)]">{item.businessName}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{item.title}</h1>
        {item.tagline && <p className="mt-2 text-sm text-[var(--color-on-accent)]">{item.tagline}</p>}
        {item.about && <p className="mt-3 max-w-2xl text-sm text-[var(--color-on-accent)]">{item.about}</p>}
        {item.contactPhone && <p className="mt-3 text-sm font-semibold text-ink">{tr("Kontak")}: {item.contactPhone}</p>}
      </header>

      <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-ink-2">
        {tr("Katalog informasi. Tautan ini tidak menerima pesanan atau pembayaran: semua transaksi dilakukan di luar aplikasi.")}
      </p>

      <section className="mt-8" aria-label={tr("Katalog produk")}>
        <h2 className="text-lg font-semibold text-ink">{tr("Katalog")}</h2>
        {products.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">{tr("Belum ada produk aktif.")}</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <li key={p.id} className="rounded-2xl border border-line bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">{p.category || tr("Produk")}</p>
                <p className="mt-1 font-semibold text-ink">{p.name}</p>
                <p className="tnum mt-2 text-lg font-semibold text-ink">{formatMoney(p.price, item.currency)}</p>
                <p className="text-xs text-ink-2">{tr("per")} {p.unit || "pcs"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
