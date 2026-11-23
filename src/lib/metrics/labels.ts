/**
 * Label tampilan untuk nilai TEKNIS metrik (basis tanggal, sumber).
 *
 * UI tidak boleh menampilkan enum mentah seperti `order_date` atau nama tabel
 * (R11-F, pola bug "layar campur bahasa"). Teks Indonesia di bawah menjadi kunci
 * `tr()` sehingga bahasa Inggris diambil dari `src/lib/ui-en.ts`.
 */
import { tr } from "@/lib/tr";

export function basisLabel(basis: string): string {
  switch (basis) {
    case "order_date":
      return tr("tanggal pesanan");
    case "statement_date":
      return tr("tanggal statement");
    case "bank_date":
      return tr("tanggal mutasi bank");
    case "posted_date":
      return tr("tanggal posting jurnal");
    case "issued_at":
      return tr("tanggal invoice diterbitkan");
    default:
      return tr("tidak diketahui");
  }
}

/** Sumber angka menurut basis tanggalnya (bukan nama tabel mentah). */
export function sourceLabel(basis: string): string {
  switch (basis) {
    case "issued_at":
      return tr("invoice diterbitkan");
    case "posted_date":
      return tr("jurnal posted");
    case "order_date":
      return tr("berkas pesanan marketplace");
    case "statement_date":
      return tr("ringkasan settlement");
    case "bank_date":
      return tr("mutasi bank");
    default:
      return tr("tidak diketahui");
  }
}
