/**
 * Penulis CSV datar + paket ZIP (R11-D §T5).
 *
 * CSV sengaja TANPA styling dan tanpa rumus: isinya nilai yang sama persis dengan sel
 * XLSX (diuji paritas per sel). Beberapa lembar dikemas sebagai satu ZIP berisi satu
 * berkas CSV per lembar, sehingga tetap dapat dibuka alat apa pun tanpa Excel.
 *
 * Keamanan: sel teks yang diawali penanda rumus dinetralkan dengan awalan `'`
 * (formula-injection / CSV injection). Nilai UANG negatif tidak dirusak — lihat
 * `neutralizeFormula` untuk alasannya.
 */
import type { SheetPart } from "./spec";
import { PALETTE } from "./spec";

/**
 * Netralkan teks yang bisa dieksekusi sebagai rumus saat dibuka di spreadsheet.
 *
 * `=`, `+`, `@`, TAB, dan CR selalu dinetralkan. `-` hanya dinetralkan bila TIDAK
 * diikuti angka, sebab `-500` adalah nilai uang negatif yang sah (dan bukan ekspresi
 * berbahaya); menambahkan `'` di depannya akan merusak angka laporan.
 */
export function neutralizeFormula(text: string): string {
  if (!text) return text;
  if (/^[=+@\t\r]/.test(text)) return `'${text}`;
  // `-` hanya aman bila seluruh isinya angka negatif biasa (`-500`); `-1+1` adalah ekspresi.
  if (text.startsWith("-") && !/^-\d+(?:\.\d+)?$/.test(text)) return `'${text}`;
  return text;
}

/** Satu sel CSV: netralkan lalu kutip bila mengandung pemisah/kutip/baris baru. */
export function csvCell(value: string): string {
  const safe = neutralizeFormula(value ?? "");
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** Satu lembar → teks CSV (header + baris, CRLF agar aman di Excel). */
export function sheetToCsv(part: SheetPart): string {
  const lines: string[] = [];
  lines.push(part.spec.columns.map((c) => csvCell(c.header)).join(","));
  for (const row of part.rows) {
    lines.push(part.spec.columns.map((c) => csvCell(row[c.key] ?? "")).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/* ───────────────────────── ZIP (STORE, tanpa dependensi) ───────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** ZIP "store" (tanpa kompresi) — cukup untuk CSV dan dapat dibuka semua alat standar. */
export function zipStore(files: { name: string; content: Buffer }[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.content);
    const size = file.content.length;

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nama berkas UTF-8
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, file.content);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, end]);
}

/** Paket CSV: satu berkas per lembar, dalam satu ZIP. */
export function buildCsvZip(parts: SheetPart[]): Buffer {
  return zipStore(parts.map((part, index) => ({ name: `${String(index + 1).padStart(2, "0")}-${part.spec.id}.csv`, content: Buffer.from(sheetToCsv(part), "utf8") })));
}

export const CSV_PALETTE_NOTE = `Palet lembar (untuk dokumen): navy #${PALETTE.navy}, hijau #${PALETTE.green}, biru #${PALETTE.blue}.`;
