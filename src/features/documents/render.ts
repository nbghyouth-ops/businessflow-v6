/**
 * Tata letak DOKUMEN SERVER (faktur/penawaran/kuitansi/surat jalan) → halaman PDF.
 *
 * Murni (tanpa DB/DOM): menerima SNAPSHOT yang sudah dibekukan saat dokumen diterbitkan,
 * lalu menyusun kop identitas BISNIS TENANT (bukan logo aplikasi), baris barang, total,
 * catatan record-only, dan kaki templat. Dipakai oleh rute server (unduh PDF) dan tes
 * (yang membaca ulang teks PDF dan membandingkannya dengan angka di DB).
 */
import { groupDigits } from "@/lib/money";
import { buildPdf, PAPER, textWidth, type PdfPage, type PdfPaper, type PdfRun } from "./pdf";

export type DocKind = "invoice" | "quotation" | "receipt" | "delivery_note";

export const DOC_KINDS: DocKind[] = ["invoice", "quotation", "receipt", "delivery_note"];

/**
 * Judul/templat bawaan per jenis. Versi bawaan = 1. Tenant dapat membuat versi baru
 * lewat `document_templates`/`document_template_versions`; dokumen menyimpan versi yang dipakai.
 */
export type DocumentTemplate = {
  paper: PdfPaper;
  footer: string;
  showPrices: boolean;
  note: string | null;
};

export const DEFAULT_TEMPLATE: Record<DocKind, DocumentTemplate> = {
  invoice: {
    paper: "a4",
    showPrices: true,
    footer: "Dokumen ini dicetak dari catatan Business Flow. Bukan tagihan pembayaran daring.",
    note: null,
  },
  quotation: {
    paper: "a4",
    showPrices: true,
    footer: "Penawaran ini bukan janji transaksi. Semua kesepakatan dilakukan di luar aplikasi.",
    note: null,
  },
  receipt: {
    paper: "a5",
    showPrices: true,
    footer: "Kuitansi ini mencatat bahwa pembayaran telah DITERIMA di luar aplikasi.",
    note: null,
  },
  delivery_note: {
    paper: "a4",
    showPrices: false,
    footer: "Surat jalan mencatat barang yang diserahkan. Bukan bukti pembayaran.",
    note: null,
  },
};

export const DOC_TITLE: Record<DocKind, string> = {
  invoice: "Faktur",
  quotation: "Penawaran",
  receipt: "Kuitansi",
  delivery_note: "Surat Jalan",
};

export type DocumentSnapshot = {
  kind: DocKind;
  number: string;
  title: string;
  businessName: string;
  businessAddress: string;
  businessContact: string;
  currency: string;
  timezone: string;
  issuedAt: string;
  clientName: string | null;
  reference: string | null;
  dueDate: string | null;
  items: { name: string; qty: string; unitPriceCents: string; totalCents: string }[];
  subtotalCents: string;
  discountCents: string;
  taxCents: string;
  totalCents: string;
  paidCents: string | null;
  note: string | null;
  footer: string;
  recordOnlyNote: string;
};

/** Uang (internal = sen) → "IDR 12.500" atau "-IDR 1.250,50". Tanpa floating point. */
export function moneyText(cents: string, currency: string): string {
  const t = String(cents ?? "0").trim() || "0";
  const neg = t.startsWith("-");
  const digits = (neg ? t.slice(1) : t).replace(/\D/g, "") || "0";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const frac = padded.slice(-2);
  return `${neg ? "-" : ""}${currency} ${groupDigits(intPart)}${frac === "00" ? "" : "," + frac}`;
}

/** "2.000" → "2"; "1.250" → "1.25". Tanpa floating point (BF-019/D-73). */
export function qtyText(value: string): string {
  const s = String(value ?? "0").trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return s;
  const frac = (m[3] ?? "").replace(/0+$/, "");
  return `${m[1]}${m[2]}${frac ? `.${frac}` : ""}`;
}

function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size, bold) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function truncate(text: string, size: number, maxWidth: number, bold = false): string {
  let s = String(text ?? "");
  if (textWidth(s, size, bold) <= maxWidth) return s;
  while (s.length > 1 && textWidth(`${s}...`, size, bold) > maxWidth) s = s.slice(0, -1);
  return `${s}...`;
}

export type LayoutCtx = {
  page: PdfPage;
  runs: PdfRun[];
  top: number;
  pages: PdfPage[];
  paper: PdfPaper;
  margin: number;
  rightEdge: number;
  contentWidth: number;
};

function pushPage(ctx: LayoutCtx) {
  ctx.pages.push({ paper: ctx.paper, runs: ctx.runs });
}

function line(ctx: LayoutCtx, opts: { text: string; size?: number; bold?: boolean; align?: PdfRun["align"]; atX?: number; gap?: number }) {
  const size = opts.size ?? 9;
  const height = size * 1.35;
  if (ctx.top + height > PAPER[ctx.paper].height - ctx.margin - 8) {
    pushPage(ctx);
    ctx.runs = [];
    ctx.top = ctx.margin + 12;
    // Kop kecil pada halaman lanjutan.
    ctx.runs.push({ text: `— lanjutan ${ctx.pages.length + 1} —`, size: 8, bold: false, align: "right", x: ctx.rightEdge, top: ctx.top });
    ctx.top += 16;
  }
  ctx.top += opts.gap ?? 0;
  const x = opts.align === "right" ? ctx.rightEdge : opts.atX ?? ctx.margin;
  ctx.runs.push({ text: opts.text, size, bold: opts.bold ?? false, align: opts.align ?? "left", x, top: ctx.top });
  ctx.top += height;
}

/** Menyusun dokumen menjadi halaman PDF. */
export function renderDocument(snapshot: DocumentSnapshot, template: DocumentTemplate): PdfPage[] {
  const { width } = PAPER[template.paper];
  const margin = template.paper === "a5" ? 28 : 40;
  const ctx: LayoutCtx = {
    page: undefined as unknown as PdfPage,
    runs: [],
    top: margin,
    pages: [],
    paper: template.paper,
    margin,
    rightEdge: width - margin,
    contentWidth: width - margin * 2,
  };

  // ── Kop identitas bisnis tenant ──
  line(ctx, { text: snapshot.businessName, size: 16, bold: true });
  if (snapshot.businessAddress) line(ctx, { text: snapshot.businessAddress, size: 9 });
  if (snapshot.businessContact) line(ctx, { text: snapshot.businessContact, size: 9 });
  ctx.top += 6;
  line(ctx, { text: snapshot.title, size: 14, bold: true });
  line(ctx, { text: `Nomor: ${snapshot.number}`, size: 10, bold: true });
  line(ctx, { text: `Tanggal: ${snapshot.issuedAt.slice(0, 10)}`, size: 9 });
  if (snapshot.dueDate) line(ctx, { text: `Jatuh tempo: ${snapshot.dueDate}`, size: 9 });
  if (snapshot.reference) line(ctx, { text: `Referensi: ${snapshot.reference}`, size: 9 });
  line(ctx, { text: `Kepada: ${snapshot.clientName ?? "Pelanggan"}` , size: 9 });
  ctx.top += 6;

  // ── Tabel barang ──
  const colAmount = ctx.rightEdge;
  const colPrice = ctx.rightEdge - (template.showPrices ? 96 : 0);
  const colQty = ctx.rightEdge - (template.showPrices ? 196 : 60);
  const descWidth = colQty - ctx.margin - 24;

  line(ctx, { text: "Barang / Jasa", size: 9, bold: true });
  // Header qty/harga/jumlah sejajar kanan pada baris yang sama: turunkan satu baris lalu tulis.
  const headerTop = ctx.top - 9 * 1.35;
  ctx.runs.push({ text: "Qty", size: 9, bold: true, align: "right", x: colQty, top: headerTop });
  if (template.showPrices) {
    ctx.runs.push({ text: "Harga", size: 9, bold: true, align: "right", x: colPrice, top: headerTop });
    ctx.runs.push({ text: "Jumlah", size: 9, bold: true, align: "right", x: colAmount, top: headerTop });
  }
  ctx.top += 2;

  if (snapshot.items.length === 0) {
    line(ctx, { text: "Tidak ada baris.", size: 9 });
  }
  for (const it of snapshot.items) {
    const desc = truncate(it.name, 9, descWidth);
    line(ctx, { text: desc, size: 9 });
    const rowTop = ctx.top - 9 * 1.35;
    ctx.runs.push({ text: qtyText(it.qty), size: 9, bold: false, align: "right", x: colQty, top: rowTop });
    if (template.showPrices) {
      ctx.runs.push({ text: moneyText(it.unitPriceCents, snapshot.currency), size: 9, bold: false, align: "right", x: colPrice, top: rowTop });
      ctx.runs.push({ text: moneyText(it.totalCents, snapshot.currency), size: 9, bold: false, align: "right", x: colAmount, top: rowTop });
    }
  }
  ctx.top += 6;

  // ── Total ──
  if (template.showPrices) {
    const totalRow = (label: string, value: string, bold = false) => {
      line(ctx, { text: label, size: 9, bold, align: "right", atX: colPrice });
      ctx.runs.push({ text: value, size: 9, bold, align: "right", x: colAmount, top: ctx.top - 9 * 1.35 });
    };
    totalRow("Subtotal", moneyText(snapshot.subtotalCents, snapshot.currency));
    if (snapshot.discountCents && snapshot.discountCents.replace(/\D/g, "").replace(/^0+$/, "") !== "") {
      totalRow("Diskon", moneyText(snapshot.discountCents, snapshot.currency));
    }
    if (snapshot.taxCents && snapshot.taxCents.replace(/\D/g, "").replace(/^0+$/, "") !== "") {
      totalRow("Pajak", moneyText(snapshot.taxCents, snapshot.currency));
    }
    totalRow("Total", moneyText(snapshot.totalCents, snapshot.currency), true);
    if (snapshot.paidCents !== null) {
      totalRow("Dibayar (di luar aplikasi)", moneyText(snapshot.paidCents, snapshot.currency));
    }
    ctx.top += 6;
  }

  // ── Catatan record-only + kaki templat ──
  for (const text of [snapshot.recordOnlyNote, snapshot.note, template.note, snapshot.footer]) {
    if (!text) continue;
    for (const l of wrapText(text, 8, ctx.contentWidth)) line(ctx, { text: l, size: 8 });
    ctx.top += 2;
  }

  pushPage(ctx);
  return ctx.pages;
}

/** Menghasilkan byte PDF dokumen. */
export function renderDocumentPdf(snapshot: DocumentSnapshot, template: DocumentTemplate): Uint8Array {
  return buildPdf(renderDocument(snapshot, template), {
    title: `${snapshot.title} ${snapshot.number}`,
    subject: snapshot.businessName,
  });
}
