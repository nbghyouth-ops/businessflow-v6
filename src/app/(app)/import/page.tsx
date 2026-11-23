"use client";

import { tr } from "@/lib/tr";
import { useBiz } from "@/components/shell";
import { ImportCenter } from "@/components/import-center";
import { ImportRecording } from "@/components/import-recording";
import { Badge, Card, PageHeader, useTx } from "@/components/ui";

/**
 * Pusat Import (F9).
 *
 * Status jujur per template: hanya Klien dan Produk yang sudah punya jalur
 * validasi + commit. Template lain ditandai "Belum tersedia" — tidak ada tombol
 * palsu yang terlihat berfungsi.
 */
const TEMPLATES: Array<{ key: string; label: string; ready: boolean }> = [
  { key: "products", label: tr("Produk"), ready: true },
  { key: "variants", label: tr("Varian produk"), ready: false },
  { key: "stock", label: tr("Stok awal"), ready: false },
  { key: "suppliers", label: tr("Supplier"), ready: false },
  { key: "clients", label: tr("Pelanggan"), ready: true },
  { key: "coa", label: tr("Bagan akun (COA)"), ready: false },
  { key: "opening-balance", label: tr("Saldo awal"), ready: false },
  { key: "cashflow", label: tr("Pemasukan / pengeluaran"), ready: false },
  { key: "bank-mutation", label: tr("Mutasi bank"), ready: false },
  { key: "marketplace-orders", label: tr("Pesanan marketplace"), ready: false },
  { key: "settlement", label: tr("Settlement"), ready: false },
  { key: "budget", label: tr("Anggaran"), ready: false },
  { key: "personal-finance", label: tr("Keuangan pribadi"), ready: false },
];

export default function ImportPage() {
  const biz = useBiz();
  // Label template diterjemahkan saat render, bukan saat modul dimuat: `tr()` di
  // tingkat modul mengunci bahasa pertama (id) dan tidak ikut preferensi pengguna.
  const tx = useTx();
  return (
    <>
      <PageHeader
        label={tr("Data")}
        title={tr("Pusat Import")}
        desc={tr("Impor data dari berkas CSV: pilih template, unggah, validasi kering, lalu konfirmasi. Validasi tidak menulis apa pun sampai Anda menekan konfirmasi.")}
      />

      <Card
        title={tr("Template impor")}
        desc={tr("Template menentukan kolom yang dibaca. Kolom tambahan diabaikan; kolom wajib yang kosong dilaporkan per baris.")}
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((tpl) => (
            <li
              key={tpl.key}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2"
            >
              <span className="text-sm font-medium text-ink-main">{tx(tpl.label)}</span>
              <Badge status={tpl.ready ? "active" : "draft"}>{tx(tpl.ready ? tr("Aktif") : tr("Belum tersedia"))}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-secondary">
          {tx(tr("Dua template pertama sudah terhubung ke validasi dan penyimpanan. Sisanya belum memiliki pemetaan kolom final dan sengaja tidak ditampilkan sebagai tombol aktif."))}
        </p>
      </Card>

      <div className="mt-4">
        {/* Impor PENCATATAN (marketplace/bank) — record only, prompt R7-C §6. */}
        <ImportRecording canWrite={biz.can("import:write")} />
      </div>

      <div className="mt-4">
        <ImportCenter />
      </div>
    </>
  );
}
