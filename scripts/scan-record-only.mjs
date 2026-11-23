#!/usr/bin/env node
/**
 * scan-record-only — penjaga aturan R1 (record-only) yang dapat menggagalkan build/verify.
 *
 * Memindai `src`, `scripts`, `public`, `functions`, `android`, dan `package.json` untuk kata
 * yang menyiratkan eksekusi uang (payment gateway, payout, escrow, wallet, write-scope
 * marketplace, klaim real-time, dsb).
 *
 * Pengecualian harus EKSPLISIT dan sempit: berkas + pola yang memang membahas larangan
 * (dokumen aturan, komentar larangan, daftar kata itu sendiri).
 *
 * Usage: node scripts/scan-record-only.mjs [--json]
 * Exit: 0 = bersih, 1 = ada pelanggaran.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "scripts", "public", "functions", "android"];
const SCAN_FILES = ["package.json"];
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".css", ".html", ".kt", ".java", ".gradle", ".xml"]);

/** Kata/izin yang dilarang muncul sebagai kemampuan. */
const RULES = [
  { id: "payment-gateway", re: /\b(midtrans|xendit|doku|stripe|paypal|braintree|adyen|billplz|nicepay|espay)\b/i },
  { id: "qris-checkout", re: /\b(qris|payment[ _-]?link|payment[ _-]?gateway|virtual[ _-]?account|autodebit|auto[ _-]?debit|autopay)\b/i },
  { id: "money-movement", re: /\b(payout|disburse(ment)?|top[ _-]?up|withdraw|escrow|stored[ _-]?value)\b/i },
  { id: "wallet", re: /\b(e-?wallet|dompet digital|saldo tersimpan)\b/i },
  { id: "marketplace-write", re: /\b(push[ _-]?(listing|price|stock|order)|update[ _-]?order[ _-]?status|write[ _-]?scope)\b/i },
  { id: "realtime-claim", re: /\b(real[ _-]?time|tersync|sinkronisasi instan|sinkronisasi otomatis)\b/i },
  { id: "forbidden-ui-cta", re: /\b(bayar sekarang|pay now|kirim refund|send refund|dana akan dicairkan)\b/i },
];

/**
 * Pengecualian eksplisit. Setiap entri menjelaskan mengapa kata itu boleh ada.
 * Tambahkan berkas di sini HANYA bila isinya memang membahas larangan/penolakan.
 */
const ALLOW = [
  // Skrip ini memuat daftar kata terlarang itu sendiri.
  { file: "scripts/scan-record-only.mjs", rules: "*", why: "definisi daftar kata terlarang" },
  // Gerbang 16 memuat nama aturan yang dilarang (mis. klaim "Real-time") di daftar periksaannya.
  { file: "scripts/scan-simulation.mjs", rules: "*", why: "definisi daftar aturan simulasi" },
  // Gerbang G-NOPAY (prompt R7-C §1) memuat daftar kata terlarang dan pola kolom terlarang.
  { file: "scripts/scan-nopay.mjs", rules: "*", why: "definisi daftar kata/kolom terlarang G-NOPAY" },
  // Catatan kepatuhan/legenda di UI yang menyatakan fitur TIDAK tersedia.
  { file: "src/components/record-only-notice.tsx", rules: "*", why: "teks pemberitahuan record-only" },
  { file: "src/lib/i18n.ts", rules: ["realtime-claim", "wallet", "payment-gateway"], why: "kamus label & pernyataan negasi" },
  { file: "src/lib/legal.ts", rules: "*", why: "dokumen legal yang menyatakan larangan" },
  { file: "src/app/(app)/help/page.tsx", rules: "*", why: "halaman bantuan menjelaskan batasan" },
  { file: "src/app/(app)/learn/page.tsx", rules: "*", why: "pusat pembelajaran menjelaskan batasan" },
  { file: "src/app/(app)/marketplace/page.tsx", rules: ["marketplace-write", "realtime-claim"], why: "menjelaskan mode impor, bukan sinkronisasi" },
  // BF-038: baris lama bertipe `ewallet` tetap harus terbaca (kompatibilitas data), tetapi
  // pembuatan baru sudah ditolak oleh enum Zod (`cash | bank`). Komentar kolom menyebut nilai
  // legacy agar migrasi berikutnya tidak mengubah data historis.
  { file: "src/db/schema.ts", rules: ["wallet"], why: "komentar nilai legacy; pembuatan baru diblokir di Zod" },
  { file: "src/db/migrations-bundle.ts", rules: ["wallet"], why: "bundel migrasi (turunan) menyimpan komentar legacy yang sama" },
];

const rel = (p) => p.split(path.sep).join("/");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

function allowFor(file) {
  return ALLOW.find((a) => (a.file === file || (a.file.endsWith("/") && file.startsWith(a.file))) && a);
}

const files = [];
for (const d of SCAN_DIRS) files.push(...walk(path.join(ROOT, d)));
for (const f of SCAN_FILES) files.push(path.join(ROOT, f));

const findings = [];
for (const abs of files) {
  const file = rel(path.relative(ROOT, abs));
  const allow = allowFor(file);
  const text = readFileSync(abs, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (allow && (allow.rules === "*" || allow.rules.includes(rule.id))) continue;
      const m = rule.re.exec(line);
      if (!m) continue;
      // Komentar yang menandai larangan ("dilarang", "tidak ada", "tanpa") bukan pelanggaran.
      if (/\b(dilarang|tidak boleh|tidak ada|tanpa|bukan|forbidden|never|not allowed)\b/i.test(line)) continue;
      findings.push({ file, line: i + 1, rule: rule.id, word: m[0], text: line.trim().slice(0, 160) });
    }
  });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
} else {
  console.log(`[scan-record-only] ${files.length} berkas dipindai, ${findings.length} temuan`);
  for (const f of findings) console.log(`  ${f.file}:${f.line} [${f.rule}] "${f.word}" → ${f.text}`);
}
process.exit(findings.length ? 1 : 0);
