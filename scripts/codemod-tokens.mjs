/**
 * Codemod token desain: mengganti literal warna heksadesimal di berkas TSX
 * dengan `var(--color-*)` yang didefinisikan di `src/app/globals.css` (@theme).
 *
 *   node scripts/codemod-tokens.mjs           # tulis perubahan
 *   node scripts/codemod-tokens.mjs --check   # hanya laporkan sisa hex (exit 1 bila ada)
 *
 * Berkas `.ts` non-TSX (mis. export-render.ts untuk jsPDF) dikecualikan karena
 * jsPDF memerlukan nilai warna nyata, lalu didokumentasikan sebagai pengecualian.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const MAP = {
  "050505": "action",
  "05603a": "success-deep",
  "067647": "ok",
  "111827": "ink-900",
  "141518": "action-deep",
  "157a3a": "success-text",
  "18181b": "action-hover",
  "2a3bd4": "legacy-cobalt-deep",
  "34a853": "google-green",
  "374151": "on-accent",
  "4285f4": "google-blue",
  "4b5563": "body",
  "5b6472": "ink-2",
  "6b7280": "muted",
  "7f1d14": "danger-deep",
  "8fa3f0": "gold",
  "991b1b": "danger-text",
  "9a420c": "warn-deep",
  "9ca3af": "disabled",
  "9eb0f5": "primary-light",
  "a12a1f": "danger-strong",
  "b2c1f8": "accent-soft",
  "b42318": "danger",
  "b54708": "warn-ink",
  "b8c5f8": "accent",
  "b91c1c": "danger-error",
  "c7d2fe": "accent-border",
  "e5e7eb": "line",
  "e7f6ec": "success-bg",
  "ea4335": "google-red",
  "ecfdf3": "success-bg-alt",
  "edf0fe": "primary-bg",
  "f1f5f9": "surface-3",
  "f3f4f6": "surface-2",
  "f4f6f9": "surface-4",
  "fbbc05": "google-yellow",
  "fdedeb": "danger-bg-alt",
  "fecaca": "coral-light",
  "fed7aa": "warn-bg-strong",
  "fef2f2": "danger-bg",
  "fef6e7": "warn-bg",
  "fff5eb": "warn-surface",
  "ffffff": "white",
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (extname(p) === ".tsx") out.push(p);
  }
  return out;
}

const check = process.argv.includes("--check");
const files = walk("src");
let changed = 0;
let occurrences = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  let after = before.replace(/#([0-9a-fA-F]{6})\b/g, (m, hex) => {
    const token = MAP[hex.toLowerCase()];
    if (!token) return m;
    occurrences++;
    return `var(--color-${token})`;
  });
  after = after.replace(/#(fff)\b/g, () => {
    occurrences++;
    return "var(--color-white)";
  });
  if (after !== before) {
    changed++;
    if (!check) writeFileSync(file, after, "utf8");
  }
}

const remaining = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const hits = text.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hits) remaining.push(`${file}: ${hits.length}`);
}

console.log(`${check ? "[check] " : ""}${changed} berkas, ${occurrences} literal hex → token`);
if (remaining.length) {
  console.log("Sisa literal hex di TSX:");
  for (const line of remaining) console.log("  " + line);
  process.exitCode = 1;
} else {
  console.log("0 literal hex tersisa di komponen TSX.");
}
