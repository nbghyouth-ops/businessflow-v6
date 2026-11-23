/**
 * Spesifikasi lembar ekspor — SATU sumber untuk XLSX, CSV, uji paritas, dan dokumen
 * (`docs/exports/PANDUAN_EKSPOR_LAPORAN.md`). Menambah/mengubah kolom cukup di sini.
 *
 * Warna diambil dari PNG referensi pemilik (`BUSINESS_FLOW_HANDOFF_V3/03_VISUAL_REFERENCES`):
 *  - navy  #1E343E (header dashboard penjualan),
 *  - hijau #7D9D78 (strip kanal marketplace),
 *  - biru  #125AC8 (band judul Laporan Laba Rugi),
 *  - abu   #D8D9DA / #BDC3C8 (subtotal & garis tabel).
 */
export type ColumnType = "text" | "money" | "count" | "date";

export type ColumnSpec = {
  key: string;
  header: string;
  headerEn: string;
  type: ColumnType;
  width: number;
};

export type SheetId = "marketplace" | "revenue" | "pnl" | "bank" | "settlement";

export type SheetSpec = {
  id: SheetId;
  title: string;
  titleEn: string;
  accent: string;
  columns: ColumnSpec[];
};

export const PALETTE = {
  navy: "1E343E",
  green: "7D9D78",
  blue: "125AC8",
  graySoft: "D8D9DA",
  gray: "BDC3C8",
  ink: "141518",
} as const;

/** Batas sinkron (A3.5): di atas ini ekspor ditolak dengan saran memecah periode. */
export const EXPORT_ROW_LIMIT = 50_000;

export class ExportTooLargeError extends Error {
  readonly code = "EXPORT_TOO_LARGE";
  constructor(public readonly rows: number) {
    super(
      `Ekspor ${rows} baris melebihi batas ${EXPORT_ROW_LIMIT} baris. Pecah periode menjadi beberapa bagian.`,
    );
    this.name = "ExportTooLargeError";
  }
}

const M = (key: string, header: string, headerEn: string, width = 16): ColumnSpec => ({
  key,
  header,
  headerEn,
  type: "money",
  width,
});

export const SHEETS: SheetSpec[] = [
  {
    id: "marketplace",
    title: "Marketplace",
    titleEn: "Marketplace",
    accent: PALETTE.navy,
    columns: [
      { key: "orderNo", header: "No. pesanan", headerEn: "Order no.", type: "text", width: 26 },
      { key: "occurredOn", header: "Tanggal pesanan", headerEn: "Order date", type: "date", width: 16 },
      { key: "channel", header: "Kanal", headerEn: "Channel", type: "text", width: 18 },
      { key: "status", header: "Status", headerEn: "Status", type: "text", width: 14 },
      M("gross", "Nilai pesanan (sumber)", "Order value (source)", 20),
      M("platformFee", "Biaya platform", "Platform fee"),
      M("net", "Nilai bersih", "Net value"),
      { key: "currency", header: "Mata uang", headerEn: "Currency", type: "text", width: 10 },
    ],
  },
  {
    id: "revenue",
    title: "Revenue",
    titleEn: "Revenue",
    accent: PALETTE.green,
    columns: [
      { key: "number", header: "Nomor invoice", headerEn: "Invoice number", type: "text", width: 20 },
      { key: "issuedOn", header: "Tanggal terbit", headerEn: "Issued on", type: "date", width: 16 },
      { key: "client", header: "Pelanggan", headerEn: "Client", type: "text", width: 26 },
      { key: "status", header: "Status", headerEn: "Status", type: "text", width: 12 },
      M("total", "Total", "Total"),
      M("paid", "Dibayar", "Paid"),
      M("balance", "Sisa", "Balance"),
      { key: "currency", header: "Mata uang", headerEn: "Currency", type: "text", width: 10 },
    ],
  },
  {
    id: "pnl",
    title: "Laba Rugi",
    titleEn: "Profit & Loss",
    accent: PALETTE.blue,
    columns: [
      { key: "section", header: "Bagian", headerEn: "Section", type: "text", width: 14 },
      { key: "code", header: "Kode akun", headerEn: "Account code", type: "text", width: 14 },
      { key: "name", header: "Akun", headerEn: "Account", type: "text", width: 34 },
      M("amount", "Jumlah", "Amount"),
      { key: "currency", header: "Mata uang", headerEn: "Currency", type: "text", width: 10 },
    ],
  },
  {
    id: "bank",
    title: "Bank",
    titleEn: "Bank",
    accent: PALETTE.gray,
    columns: [
      { key: "date", header: "Tanggal mutasi", headerEn: "Transaction date", type: "date", width: 16 },
      { key: "description", header: "Keterangan", headerEn: "Description", type: "text", width: 40 },
      { key: "direction", header: "Arah", headerEn: "Direction", type: "text", width: 10 },
      M("amount", "Nominal", "Amount"),
      { key: "matched", header: "Pencocokan", headerEn: "Match status", type: "text", width: 14 },
      { key: "reference", header: "Referensi", headerEn: "Reference", type: "text", width: 22 },
      { key: "currency", header: "Mata uang", headerEn: "Currency", type: "text", width: 10 },
    ],
  },
  {
    id: "settlement",
    title: "Settlement",
    titleEn: "Settlement",
    accent: PALETTE.graySoft,
    columns: [
      { key: "statementOn", header: "Tanggal statement", headerEn: "Statement date", type: "date", width: 16 },
      { key: "channel", header: "Kanal", headerEn: "Channel", type: "text", width: 18 },
      M("settlementTotal", "Settlement dilaporkan", "Reported settlement", 20),
      M("feeTotal", "Biaya dilaporkan", "Reported fee"),
      M("adjustmentTotal", "Penyesuaian", "Adjustment"),
      { key: "currency", header: "Mata uang", headerEn: "Currency", type: "text", width: 10 },
    ],
  },
];

export function sheetById(id: SheetId): SheetSpec {
  const found = SHEETS.find((s) => s.id === id);
  if (!found) throw new Error(`Lembar ekspor tidak dikenal: ${id}`);
  return found;
}

/** Baris ekspor: semua nilai sudah TEKS (uang = desimal eksak). */
export type ExportRow = Record<string, string>;
export type SheetPart = { spec: SheetSpec; rows: ExportRow[] };

export function totalRows(parts: SheetPart[]): number {
  return parts.reduce((n, p) => n + p.rows.length, 0);
}
