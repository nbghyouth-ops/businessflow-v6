/**
 * Kamus field kanonik impor generik (prompt R10 §A3.7 / R12 langkah 1).
 *
 * Field TUJUAN milik Business Flow — BUKAN nama kolom provider. Tidak ada daftar
 * header provider dan tidak ada alias: pengguna yang memetakan kolom berkasnya
 * sendiri ke field di sini.
 */

export type FieldType = "text" | "money" | "int" | "date";
export type FieldDef = {
  key: string;
  label: string;
  /** Definisi singkat yang ditampilkan di UI pemetaan. */
  help: string;
  type: FieldType;
  required?: boolean;
  /** Diisi dari konteks (toko/rekening terpilih), bukan dari kolom berkas. */
  fromContext?: boolean;
};
export type ReportDomain = "marketplace" | "bank";
export type AmountRule = "single" | "debit_credit" | "signed";
export type ReportTypeDef = {
  key: string;
  label: string;
  domain: ReportDomain;
  rowGrain: string;
  fields: FieldDef[];
  /** Nama kolom berkas yang dipakai untuk kunci alami baris (tanpa hash). */
  keyFields: string[];
  /** Field yang bila hilang membuat baris `NEEDS_MAPPING` dan memblokir commit. */
  blockingWhenMissing?: string[];
  /**
   * Apakah jenis laporan ini WAJIB punya tanggal pengikat. Laporan item dan rincian
   * settlement tidak memuat tanggal sendiri (tanggalnya milik header/statement),
   * jadi tanggal kosong disimpan NULL — bukan dikarang dan bukan dianggap invalid.
   */
  requiresDate: boolean;
};

const F = (
  key: string,
  label: string,
  help: string,
  type: FieldType,
  required?: boolean,
  fromContext?: boolean,
): FieldDef => ({ key, label, help, type, required, fromContext });

const currency = () => F("currency_code", "Currency code", "ISO 4217 mata uang nominal; diambil dari berkas atau konfigurasi toko/rekening yang dikonfirmasi — tidak ditebak.", "text");

export const ORDER_HEADER_FIELDS: FieldDef[] = [
  F("external_order_id", "Order ID (sumber)", "ID pesanan pada berkas sumber. Tidak dibuat dari nomor baris.", "text", true),
  F("order_date", "Order date", "Tanggal pesanan; dasar KPI berbasis tanggal.", "date", true),
  F("order_status_raw", "Order status (mentah)", "Status apa adanya dari sumber; pemetaan status kanonik dikonfirmasi pengguna.", "text"),
  F("purchase_channel", "Purchase channel", "Kanal pembelian bila sumber memisahkannya (mis. TikTok Shop vs Tokopedia).", "text"),
  currency(),
  F("buyer_reference_masked", "Buyer reference (disamarkan)", "Hindari nama/kontak/alamat; nilai disamarkan sebelum dicatat.", "text"),
  F("order_gross_amount", "Order gross amount", "Nilai pesanan menurut sumber, sebelum/atau termasuk diskon sesuai definisi sumber (dicatat apa adanya).", "money"),
  F("order_discount_total", "Order discount total", "Total diskon bila penanggung (penjual/platform) TIDAK dipisah sumber.", "money"),
  F("shipping_amount", "Shipping amount", "Ongkos kirim; basis penanggung harus jelas dari sumber.", "money"),
  F("order_updated_at", "Order updated at", "Waktu perubahan terakhir menurut sumber.", "date"),
];

export const ORDER_ITEM_FIELDS: FieldDef[] = [
  F("external_order_id", "Order ID (sumber)", "ID pesanan pada berkas sumber.", "text", true),
  F("external_item_id", "Item ID (sumber)", "ID item stabil bila sumber menyediakannya.", "text"),
  F("seller_sku", "Seller SKU", "SKU milik penjual.", "text"),
  F("platform_sku", "Platform SKU", "SKU menurut platform.", "text"),
  F("product_name_raw", "Nama produk (mentah)", "Nama produk apa adanya.", "text"),
  F("variant_raw", "Varian (mentah)", "Nama variasi apa adanya.", "text"),
  F("quantity", "Quantity", "Jumlah unit; eksak, tidak dibulatkan.", "int", true),
  F("unit_price", "Unit price", "Harga satuan sebelum diskon.", "money"),
  F("gross_line_amount", "Gross line amount", "Nilai baris sebelum diskon (bedakan sebelum/sesudah).", "money"),
  F("seller_discount_amount", "Diskon penjual", "Diskon ditanggung penjual.", "money"),
  F("platform_discount_amount", "Diskon platform", "Diskon ditanggung platform.", "money"),
  F("line_currency_code", "Currency code (baris)", "Mata uang baris item.", "text"),
];

export const SETTLEMENT_SUMMARY_FIELDS: FieldDef[] = [
  F("statement_reference", "Statement reference", "Identitas statement dari sumber; bila tidak ada, pengguna mengonfirmasi identitas/periode.", "text"),
  F("statement_period_start", "Periode mulai", "Awal periode statement.", "date"),
  F("statement_period_end", "Periode akhir", "Akhir periode statement.", "date"),
  F("statement_date", "Statement date", "Tanggal statement.", "date"),
  currency(),
  F("gross_or_net_total", "Gross/net total", "Total menurut basis yang dinyatakan sumber.", "money"),
  F("fee_total", "Total biaya", "Total biaya/komisi yang benar-benar tercantum di statement.", "money"),
  F("adjustment_total", "Total penyesuaian", "Total penyesuaian (termasuk retur) menurut sumber.", "money"),
  F("settlement_total", "Settlement total", "Nilai settlement dilaporkan; BUKAN kas diterima.", "money", true),
  F("reserve_or_hold_amount", "Reserve/hold", "Hanya bila sumber menyatakannya.", "money"),
];

export const SETTLEMENT_LINE_FIELDS: FieldDef[] = [
  F("statement_reference", "Statement reference", "Identitas statement sumber.", "text"),
  F("external_order_id", "Order ID (sumber)", "Order terkait baris ini.", "text"),
  F("external_adjustment_id", "Adjustment ID", "ID penyesuaian bila baris ini bukan order.", "text"),
  F("settlement_line_type_raw", "Type (mentah)", "Jenis baris apa adanya (order/adjustment/refund).", "text"),
  currency(),
  F("gross_sales_amount", "Gross sales", "Penjualan bruto baris.", "money"),
  F("net_sales_amount", "Net sales", "Penjualan bersih baris.", "money"),
  F("shipping_amount", "Shipping", "Ongkir baris.", "money"),
  F("seller_discount_amount", "Diskon penjual", "Diskon penjual baris.", "money"),
  F("platform_discount_amount", "Diskon platform", "Diskon platform baris.", "money"),
  F("fee_amount", "Fee", "Biaya/komisi baris (pisahkan jenis bila ada).", "money"),
  F("adjustment_amount", "Adjustment", "Penyesuaian baris.", "money"),
  F("refund_amount", "Refund (catatan)", "Retur/refund TERCATAT — bukan eksekusi refund.", "money"),
  F("settlement_line_amount", "Settlement line amount", "Nilai settlement baris; dasar rekonsiliasi per baris.", "money", true),
  F("external_payment_reference", "Payment reference", "Referensi pembayaran eksternal (teks referensi, bukan instruksi).", "text"),
];

export const BANK_LINE_FIELDS: FieldDef[] = [
  F("transaction_date", "Tanggal transaksi", "Tanggal transaksi; dasar pencocokan tanggal. Boleh kosong dengan status incomplete.", "date"),
  F("posting_date", "Tanggal posting", "Tanggal pembukuan bank.", "date"),
  F("value_date", "Tanggal valuta", "Tanggal valuta.", "date"),
  F("description_raw", "Keterangan", "Keterangan mutasi; disamarkan sebelum dicatat.", "text"),
  F("reference_raw", "Referensi", "Nomor referensi/berita bila ada.", "text"),
  F("debit_amount", "Debit", "Kolom debit (mutasi keluar) bila sumber memisahkan debit/kredit.", "money"),
  F("credit_amount", "Kredit", "Kolom kredit (mutasi masuk) bila sumber memisahkan debit/kredit.", "money"),
  F("signed_amount", "Jumlah bertanda", "Satu kolom nominal bertanda; arah mengikuti tanda/kurung/penanda CR-DB.", "money"),
  F("running_balance", "Saldo berjalan", "Saldo setelah mutasi; hanya bila sumber menyediakannya.", "money"),
  currency(),
  F("external_transaction_reference", "Referensi transaksi bank", "Referensi unik transaksi bank bila ada.", "text"),
];

export const REPORT_TYPES: ReportTypeDef[] = [
  {
    key: "orders_header",
    label: "Pesanan marketplace — Order Header",
    domain: "marketplace",
    rowGrain: "1 baris = 1 pesanan",
    fields: ORDER_HEADER_FIELDS,
    keyFields: ["external_order_id"],
    blockingWhenMissing: ["external_order_id"],
    requiresDate: true,
  },
  {
    key: "orders_items",
    label: "Pesanan marketplace — Order Items",
    domain: "marketplace",
    rowGrain: "1 baris = 1 item pesanan",
    fields: ORDER_ITEM_FIELDS,
    keyFields: ["external_order_id", "external_item_id", "seller_sku", "quantity"],
    blockingWhenMissing: ["external_order_id", "quantity"],
    requiresDate: false,
  },
  {
    key: "settlement_summary",
    label: "Settlement — Statement Summary",
    domain: "marketplace",
    rowGrain: "1 baris = 1 statement",
    fields: SETTLEMENT_SUMMARY_FIELDS,
    keyFields: ["statement_reference", "statement_date"],
    blockingWhenMissing: ["settlement_total"],
    requiresDate: true,
  },
  {
    key: "settlement_lines",
    label: "Settlement — Order/Adjustment Details",
    domain: "marketplace",
    rowGrain: "1 baris = 1 rincian statement",
    fields: SETTLEMENT_LINE_FIELDS,
    keyFields: ["statement_reference", "external_order_id", "external_adjustment_id", "external_payment_reference"],
    blockingWhenMissing: ["settlement_line_amount"],
    requiresDate: false,
  },
  {
    key: "bank_lines",
    label: "Bank — Transaction Lines",
    domain: "bank",
    rowGrain: "1 baris = 1 mutasi",
    fields: BANK_LINE_FIELDS,
    keyFields: ["transaction_date", "reference_raw", "debit_amount", "credit_amount", "signed_amount", "running_balance"],
    requiresDate: true,
  },
];

export function reportType(key: string): ReportTypeDef | undefined {
  return REPORT_TYPES.find((r) => r.key === key);
}

export function reportField(reportKey: string, fieldKey: string): FieldDef | undefined {
  return reportType(reportKey)?.fields.find((f) => f.key === fieldKey);
}

/**
 * Konteks provider: HANYA label + domain. Tidak ada daftar header kolom dan tidak
 * ada adapter native (prompt §M-14). Provider = dari mana berkas berasal, dipilih pengguna.
 */
export const PROVIDER_CONTEXTS: Array<{ code: string; label: string; domain: ReportDomain }> = [
  { code: "shopee", label: "Shopee", domain: "marketplace" },
  { code: "tiktok_shop", label: "TikTok Shop", domain: "marketplace" },
  { code: "tokopedia", label: "Tokopedia", domain: "marketplace" },
  { code: "lazada", label: "Lazada", domain: "marketplace" },
  { code: "blibli", label: "Blibli", domain: "marketplace" },
  { code: "bca", label: "Bank BCA", domain: "bank" },
  { code: "mandiri", label: "Bank Mandiri", domain: "bank" },
  { code: "bni", label: "Bank BNI", domain: "bank" },
  { code: "bri", label: "Bank BRI", domain: "bank" },
  { code: "other", label: "Lainnya", domain: "marketplace" },
  { code: "other_bank", label: "Bank lainnya", domain: "bank" },
];

/** Batas cakupan impor (prompt §A3.2 / §D-22). */
export const FORMAT_NOT_SUPPORTED_HINT =
  "Format ini belum didukung. Unduh CSV atau XLSX dari portal sumber, lalu impor berkas itu.";

export const SUPPORTED_EXTENSIONS = [".csv", ".txt", ".xlsx"] as const;
