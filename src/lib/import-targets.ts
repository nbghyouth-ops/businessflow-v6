/**
 * Registry 11 templat impor CSV.
 *
 * Modul ini murni (tanpa DB) agar bisa dipakai server dan UI sekaligus:
 * label, kolom yang diterima, dan kunci anti-duplikat.
 */
export type ImportTargetKey =
  | "clients"
  | "products"
  | "suppliers"
  | "employees"
  | "projects"
  | "tasks"
  | "assets"
  | "booking_resources"
  | "campaigns"
  | "warehouses"
  | "branches";

export type ImportTargetDef = {
  key: ImportTargetKey;
  label: string;
  /** Kolom yang dibaca; nama lain (Indonesia) dipetakan di `aliases`. */
  columns: string[];
  aliases?: Record<string, string>;
  /** Kolom kunci untuk mendeteksi duplikat. Kosong = tidak ada pemeriksaan duplikat. */
  unique?: string;
  /** Kolom yang wajib ada isinya. */
  required: string[];
  /** Kolom numerik (divalidasi lalu di-cast ::numeric). */
  numeric?: string[];
  /** Kolom tanggal (YYYY-MM-DD). */
  dates?: string[];
  sample: string;
};

export const IMPORT_TARGETS: ImportTargetDef[] = [
  {
    key: "clients",
    label: "Klien",
    columns: ["name", "phone", "email", "address"],
    aliases: { nama: "name", telepon: "phone", alamat: "address", surel: "email" },
    unique: "email",
    required: ["name"],
    sample: "name,phone,email,address\nBudi,0812...,budi@contoh.id,Jl. Merdeka 1",
  },
  {
    key: "products",
    label: "Produk",
    columns: ["sku", "name", "price", "unit", "category", "barcode"],
    aliases: { nama: "name", harga: "price", satuan: "unit", kategori: "category", barcode: "barcode" },
    unique: "sku",
    required: ["sku", "name", "price"],
    numeric: ["price"],
    sample: "sku,name,price,unit\nSKU-1,Kopi Arabika,45000,pcs",
  },
  {
    key: "suppliers",
    label: "Pemasok",
    columns: ["name", "phone", "email", "address", "notes"],
    aliases: { nama: "name", telepon: "phone", alamat: "address", catatan: "notes" },
    unique: "email",
    required: ["name"],
    sample: "name,phone,email\nPT Sumber Makmur,021...,sales@sumber.id",
  },
  {
    key: "employees",
    label: "Karyawan",
    columns: ["name", "position", "department", "phone", "email", "hire_date", "salary"],
    aliases: { nama: "name", jabatan: "position", departemen: "department", telepon: "phone", gaji: "salary", tanggal_masuk: "hire_date" },
    unique: "email",
    required: ["name"],
    numeric: ["salary"],
    dates: ["hire_date"],
    sample: "name,position,email,salary\nSari,Kasir,sari@toko.id,4500000",
  },
  {
    key: "projects",
    label: "Proyek",
    columns: ["name", "budget", "start_date", "end_date", "notes"],
    aliases: { nama: "name", anggaran: "budget", mulai: "start_date", selesai: "end_date", catatan: "notes" },
    unique: "name",
    required: ["name"],
    numeric: ["budget"],
    dates: ["start_date", "end_date"],
    sample: "name,budget,start_date,end_date\nRenovasi Toko,15000000,2026-12-01,2026-12-20",
  },
  {
    key: "tasks",
    label: "Tugas",
    columns: ["title", "description", "priority", "due_date", "assignee"],
    aliases: { judul: "title", deskripsi: "description", prioritas: "priority", tenggat: "due_date", penanggung_jawab: "assignee" },
    unique: "title",
    required: ["title"],
    dates: ["due_date"],
    sample: "title,priority,due_date\nCek stok gudang,normal,2026-12-02",
  },
  {
    key: "assets",
    label: "Aset",
    columns: ["name", "category", "location", "purchase_date", "cost", "useful_life_months"],
    aliases: { nama: "name", kategori: "category", lokasi: "location", tanggal_beli: "purchase_date", harga: "cost", umur_bulan: "useful_life_months" },
    unique: "name",
    required: ["name"],
    numeric: ["cost"],
    dates: ["purchase_date"],
    sample: "name,category,purchase_date,cost,useful_life_months\nEtalase Kaca,peralatan,2026-01-10,3500000,60",
  },
  {
    key: "booking_resources",
    label: "Sumber Daya Booking",
    columns: ["name", "kind"],
    aliases: { nama: "name", jenis: "kind" },
    unique: "name",
    required: ["name"],
    sample: "name,kind\nRuang Meeting A,room",
  },
  {
    key: "campaigns",
    label: "Kampanye",
    columns: ["name", "channel", "budget", "start_date", "end_date"],
    aliases: { nama: "name", saluran: "channel", anggaran: "budget", mulai: "start_date", selesai: "end_date" },
    unique: "name",
    required: ["name"],
    numeric: ["budget"],
    dates: ["start_date", "end_date"],
    sample: "name,channel,budget\nPromo Akhir Tahun,instagram,2000000",
  },
  {
    key: "warehouses",
    label: "Gudang",
    columns: ["name"],
    aliases: { nama: "name" },
    unique: "name",
    required: ["name"],
    sample: "name\nGudang Utama",
  },
  {
    key: "branches",
    label: "Cabang",
    columns: ["name", "code", "address"],
    aliases: { nama: "name", kode: "code", alamat: "address" },
    unique: "name",
    required: ["name"],
    sample: "name,code,address\nCabang Bandung,BDG,Jl. Asia Afrika 10",
  },
];

export const IMPORT_TARGET_KEYS = IMPORT_TARGETS.map((t) => t.key);

export function importTarget(key: string): ImportTargetDef | undefined {
  return IMPORT_TARGETS.find((t) => t.key === key);
}

/** Normalisasi header + alias Indonesia → nama kolom baku. */
export function normalizeImportRow(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase();
    out[key] = String(v ?? "").trim();
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^\d{1,15}(\.\d{1,2})?$/;

function aliasOf(def: ImportTargetDef, row: Record<string, string>, col: string): string {
  if (row[col] !== undefined) return row[col];
  for (const [from, to] of Object.entries(def.aliases ?? {})) {
    if (to === col && row[from] !== undefined) return row[from];
  }
  return "";
}

/** Nilai baku satu kolom (setelah alias + trim). */
export function importValue(target: string, raw: Record<string, string>, col: string): string {
  const def = importTarget(target);
  if (!def) return "";
  return aliasOf(def, normalizeImportRow(raw), col);
}

/** Validasi murni satu baris. Mengembalikan pesan galat atau null. */
export function validateImportRow(target: string, raw: Record<string, string>): string | null {
  const def = importTarget(target);
  if (!def) return "Target impor tidak dikenal.";
  const row = normalizeImportRow(raw);
  for (const col of def.required) {
    if (!aliasOf(def, row, col)) return `${col} wajib diisi`;
  }
  for (const col of def.numeric ?? []) {
    const v = aliasOf(def, row, col);
    if (v && !NUM_RE.test(v)) return `${col} harus angka (maks 2 desimal)`;
  }
  for (const col of def.dates ?? []) {
    const v = aliasOf(def, row, col);
    if (v && !DATE_RE.test(v)) return `${col} harus format YYYY-MM-DD`;
  }
  const email = aliasOf(def, row, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "email tidak valid";
  return null;
}

/** Kunci duplikat satu baris (kosong bila target tanpa kunci unik). */
export function importRowKey(target: string, raw: Record<string, string>): string {
  const def = importTarget(target);
  if (!def?.unique) return "";
  return importValue(target, raw, def.unique).toLowerCase();
}
