"use client";
import { runWithDownloadProgress } from "@/components/download-loader";
import { downloadComprehensiveActivityExcel } from "@/lib/excel-export";
import { toCsv } from "./client";
import { fromCents } from "./money";
import { beginExternalPicker } from "@/components/lock-provider";
import type { ActivitySnapshot, ReceiptSnapshot } from "@/server/routes/exports";

export type TemplateOverrides = {
  businessName?: string;
  address?: string;
  contact?: string;
  closingText?: string;
  accentColor?: string;
  showContact?: boolean;
  showVerification?: boolean;
  showOperator?: boolean;
};

export function safeFileSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "bisnis";
}

export function receiptFilename(invoiceNumber: string, preset: string, ext: string): string {
  return `struk-${safeFileSlug(invoiceNumber)}-${safeFileSlug(preset)}.${ext}`;
}

export function activityFilename(businessName: string, from: string, to: string, preset: string, ext: string): string {
  return `aktivitas-${safeFileSlug(businessName)}-${from}_${to}-${safeFileSlug(preset)}.${ext}`;
}

export function fmtCentsDisplay(centsStr: string, currency: string): string {
  const neg = centsStr.startsWith("-");
  const abs = BigInt(neg ? centsStr.slice(1) : centsStr);
  const raw = fromCents(abs);
  const [intPart, decPart] = raw.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const val = currency === "IDR" || currency === "JPY" ? grouped : `${grouped},${decPart}`;
  const prefix = currency === "IDR" ? "Rp " : `${currency} `;
  return `${neg ? "-" : ""}${prefix}${val}`;
}

export function fmtLocalDateTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${cur} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      cur = next;
    } else {
      lines.push(cur);
      cur = words[i];
    }
  }
  lines.push(cur);
  return lines;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  beginExternalPicker(15_000);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ───────── Template A: Struk Penjualan (PNG / JPG via Canvas) ───────── */
export function renderReceiptToCanvas(
  snap: ReceiptSnapshot,
  preset: string,
  overrides: TemplateOverrides = {},
): HTMLCanvasElement {
  const mono = preset === "monochrome";
  const width = preset === "58mm" ? 420 : preset === "80mm" ? 560 : preset === "a4" ? 794 : preset === "a5" || preset === "a4_a5" ? 560 : 520;
  const pad = preset === "58mm" ? 28 : 40;
  const contentW = width - pad * 2;

  const accent = mono ? "#111111" : overrides.accentColor || "#3B4FF8";
  const mintBg = mono ? "#f2f2f2" : "#EEF1FF";
  const ink = mono ? "#000000" : "#111827";
  const ink2 = mono ? "#333333" : "#6B7280";
  const lineClr = mono ? "#bdbdbd" : "#E5E7EB";

  const bizName = overrides.businessName || snap.businessName;
  const bizAddr = overrides.address || snap.businessAddress;
  const bizContact = overrides.contact || snap.businessContact;
  const closing = overrides.closingText || "Terima kasih telah berbelanja";

  // Pre-measure height
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = "600 16px Inter, system-ui, sans-serif";
  let estH = 440;
  for (const it of snap.items) {
    const wrapped = wrapTextLines(probe, it.name, contentW * 0.62);
    estH += wrapped.length * 22 + 26;
  }
  estH += 180;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(640, estH);
  const c = canvas.getContext("2d")!;

  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, canvas.width, canvas.height);

  let y = pad;

  // 1. Kepala: ikon toko dalam kotak mint membulat, rata tengah
  c.fillStyle = mintBg;
  c.beginPath();
  c.roundRect(width / 2 - 26, y, 52, 52, 14);
  c.fill();
  c.strokeStyle = accent;
  c.lineWidth = 2.5;
  c.strokeRect(width / 2 - 12, y + 16, 24, 20);
  c.beginPath();
  c.moveTo(width / 2 - 14, y + 16);
  c.lineTo(width / 2 + 14, y + 16);
  c.stroke();
  y += 68;

  c.textAlign = "center";
  c.fillStyle = ink;
  c.font = "700 22px Inter, system-ui, sans-serif";
  c.fillText(bizName.toUpperCase(), width / 2, y);
  y += 22;

  c.fillStyle = ink2;
  c.font = "400 13px Inter, system-ui, sans-serif";
  for (const l of wrapTextLines(c, bizAddr, contentW)) {
    c.fillText(l, width / 2, y);
    y += 18;
  }
  if (overrides.showContact !== false && bizContact && bizContact !== "—") {
    c.fillText(bizContact, width / 2, y);
    y += 18;
  }
  c.fillStyle = ink;
  c.font = "600 14px Inter, system-ui, sans-serif";
  c.fillText("Bukti Transaksi Penjualan", width / 2, y + 4);
  y += 22;

  const divider = () => {
    c.strokeStyle = lineClr;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(pad, y);
    c.lineTo(width - pad, y);
    c.stroke();
    y += 18;
  };
  divider();

  // 3. No. Transaksi, Tanggal, Kasir / Operator
  const kv = (k: string, v: string, bold = false) => {
    c.textAlign = "left";
    c.fillStyle = ink2;
    c.font = "400 13.5px Inter, system-ui, sans-serif";
    c.fillText(k, pad, y);
    c.textAlign = "right";
    c.fillStyle = ink;
    c.font = `${bold ? "700" : "600"} 13.5px Inter, system-ui, sans-serif`;
    c.fillText(v, width - pad, y);
    y += 22;
  };

  kv("No. Transaksi", snap.invoiceNumber, true);
  kv("Tanggal", fmtLocalDateTime(snap.issuedAt, snap.timezone));
  if (overrides.showOperator !== false) {
    kv("Kasir / Operator", snap.operator);
  }
  if (snap.clientName) {
    kv("Klien", snap.clientName);
  }
  y += 2;
  divider();

  // 5. Header Produk & Jumlah
  c.textAlign = "left";
  c.fillStyle = ink2;
  c.font = "700 12.5px Inter, system-ui, sans-serif";
  c.fillText("PRODUK", pad, y);
  c.textAlign = "right";
  c.fillText("JUMLAH", width - pad, y);
  y += 22;

  for (const item of snap.items) {
    c.textAlign = "left";
    c.fillStyle = ink;
    c.font = "600 15px Inter, system-ui, sans-serif";
    const wrapped = wrapTextLines(c, item.name, contentW * 0.62);
    for (let idx = 0; idx < wrapped.length; idx++) {
      c.fillText(wrapped[idx], pad, y);
      if (idx === 0) {
        c.textAlign = "right";
        c.font = "600 15px Inter, system-ui, sans-serif";
        c.fillText(fmtCentsDisplay(item.totalCents, snap.currency), width - pad, y);
        c.textAlign = "left";
      }
      y += 20;
    }
    c.fillStyle = ink2;
    c.font = "400 12.5px Inter, system-ui, sans-serif";
    c.fillText(`${item.qty} × ${fmtCentsDisplay(item.unitPriceCents, snap.currency)}`, pad, y);
    y += 24;
  }

  divider();

  // 7. Subtotal, Diskon, Pajak
  kv("Subtotal", fmtCentsDisplay(snap.subtotalCents, snap.currency));
  if (BigInt(snap.discountCents) > 0n) {
    kv("Diskon", `-${fmtCentsDisplay(snap.discountCents, snap.currency)}`);
  }
  if (BigInt(snap.taxCents) > 0n) {
    kv("Pajak / biaya", fmtCentsDisplay(snap.taxCents, snap.currency));
  }

  // 8. TOTAL dalam pita mint
  c.fillStyle = mintBg;
  c.beginPath();
  c.roundRect(pad - 8, y - 6, contentW + 16, 44, 10);
  c.fill();
  c.textAlign = "left";
  c.fillStyle = accent;
  c.font = "700 16px Inter, system-ui, sans-serif";
  c.fillText("TOTAL", pad + 4, y + 21);
  c.textAlign = "right";
  c.font = "700 20px Inter, system-ui, sans-serif";
  c.fillText(fmtCentsDisplay(snap.totalCents, snap.currency), width - pad - 4, y + 22);
  y += 58;

  // 9. Dibayar & Kembalian / Sisa
  kv("Dibayar", fmtCentsDisplay(snap.paidCents, snap.currency));
  kv(
    snap.isPartialOrDue ? "Sisa tagihan" : "Kembalian",
    fmtCentsDisplay(snap.changeOrDueCents, snap.currency),
    true,
  );
  y += 4;
  divider();

  // 11. Penutup rata tengah
  c.textAlign = "center";
  c.fillStyle = ink;
  c.font = "700 14.5px Inter, system-ui, sans-serif";
  c.fillText(closing, width / 2, y);
  y += 20;
  c.fillStyle = ink2;
  c.font = "400 12.5px Inter, system-ui, sans-serif";
  c.fillText("Simpan bukti transaksi ini untuk referensi.", width / 2, y);
  y += 20;
  if (overrides.showVerification !== false) {
    c.fillStyle = accent;
    c.font = "600 12.5px Inter, system-ui, sans-serif";
    c.fillText(`Kode verifikasi: ${snap.verificationCode}`, width / 2, y);
    y += 20;
  }

  // Crop final height cleanly
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = width;
  finalCanvas.height = y + pad;
  const fc = finalCanvas.getContext("2d")!;
  fc.fillStyle = "#ffffff";
  fc.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
  fc.drawImage(canvas, 0, 0);
  return finalCanvas;
}

/* ───────── Template B: Business Activity Summary (PNG / JPG via Canvas) ───────── */
export function renderActivityToCanvas(
  snap: ActivitySnapshot,
  overrides: TemplateOverrides = {},
): HTMLCanvasElement {
  const width = 920;
  const pad = 48;
  const contentW = width - pad * 2;
  const accent = overrides.accentColor || "#3B4FF8";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 1180;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, width, canvas.height);

  let y = pad;

  // 1. Header
  c.textAlign = "left";
  c.fillStyle = accent;
  c.font = "700 12px Inter, system-ui, sans-serif";
  c.fillText("BUSINESS FLOW REPORT", pad, y + 12);

  c.fillStyle = "#111827";
  c.font = "700 28px Inter, system-ui, sans-serif";
  c.fillText("Business Activity Summary", pad, y + 46);

  c.fillStyle = "#6B7280";
  c.font = "400 14px Inter, system-ui, sans-serif";
  c.fillText(`${overrides.businessName || snap.businessName} · ${snap.from} s.d. ${snap.to}`, pad, y + 70);

  // Chart icon in primary box top-right
  c.fillStyle = "#EEF1FF";
  c.beginPath();
  c.roundRect(width - pad - 56, y, 56, 56, 14);
  c.fill();
  c.fillStyle = accent;
  c.fillRect(width - pad - 42, y + 32, 8, 12);
  c.fillRect(width - pad - 30, y + 22, 8, 22);
  c.fillRect(width - pad - 18, y + 14, 8, 30);

  y += 96;
  c.strokeStyle = "#E5E7EB";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(pad, y);
  c.lineTo(width - pad, y);
  c.stroke();
  y += 28;

  // 3. Grid KPI 2x2
  const kpis = [
    { label: "Total aktivitas", value: String(snap.kpis.totalActivities) },
    { label: "Total penjualan", value: fmtCentsDisplay(snap.kpis.totalSalesCents, snap.currency) },
    { label: "Total pemasukan", value: fmtCentsDisplay(snap.kpis.totalIncomeCents, snap.currency) },
    { label: "Total pengeluaran", value: fmtCentsDisplay(snap.kpis.totalExpenseCents, snap.currency) },
  ];
  const cardW = (contentW - 18) / 2;
  const cardH = 88;
  kpis.forEach((k, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = pad + col * (cardW + 18);
    const cy = y + row * (cardH + 16);
    c.fillStyle = "#EEF1FF";
    c.beginPath();
    c.roundRect(x, cy, cardW, cardH, 14);
    c.fill();
    c.fillStyle = "#6B7280";
    c.font = "600 13px Inter, system-ui, sans-serif";
    c.textAlign = "left";
    c.fillText(k.label, x + 20, cy + 30);
    c.fillStyle = "#111827";
    c.font = "700 22px Inter, system-ui, sans-serif";
    c.fillText(k.value, x + 20, cy + 64);
  });
  y += cardH * 2 + 44;

  // 4. Ringkasan per modul
  c.fillStyle = "#111827";
  c.font = "700 18px Inter, system-ui, sans-serif";
  c.textAlign = "left";
  c.fillText("Ringkasan per modul", pad, y);
  y += 20;

  for (const mod of snap.modules) {
    y += 14;
    c.strokeStyle = "#E5E7EB";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pad, y);
    c.lineTo(width - pad, y);
    c.stroke();
    y += 26;
    c.textAlign = "left";
    c.fillStyle = "#111827";
    c.font = "600 14.5px Inter, system-ui, sans-serif";
    c.fillText(mod.label, pad, y);

    c.textAlign = "right";
    c.fillStyle = mod.hasActivity ? accent : "#9CA3AF";
    c.font = `${mod.hasActivity ? "700" : "400"} 14px Inter, system-ui, sans-serif`;
    c.fillText(mod.summary, width - pad, y);
  }
  y += 38;

  // 5. Kotak accent Kesimpulan aktivitas periode
  const conclusionLines = wrapTextLines(c, snap.conclusion, contentW - 40);
  const boxH = 54 + conclusionLines.length * 22;
  c.fillStyle = "#EEF1FF";
  c.beginPath();
  c.roundRect(pad, y, contentW, boxH, 14);
  c.fill();
  c.textAlign = "left";
  c.fillStyle = accent;
  c.font = "700 14px Inter, system-ui, sans-serif";
  c.fillText("Kesimpulan aktivitas periode", pad + 20, y + 28);
  c.fillStyle = "#111827";
  c.font = "400 14px Inter, system-ui, sans-serif";
  let cy = y + 52;
  for (const line of conclusionLines) {
    c.fillText(line, pad + 20, cy);
    cy += 22;
  }
  y += boxH + 34;

  // 6. Footer
  c.fillStyle = "#6B7280";
  c.font = "400 12.5px Inter, system-ui, sans-serif";
  c.textAlign = "left";
  c.fillText(
    `${fmtLocalDateTime(snap.generatedAt, snap.timezone)} · Cabang: ${snap.branchName} · Pembuat: ${snap.operator} · ${snap.reportNumber} · Kode: ${snap.verificationCode}`,
    pad,
    y,
  );
  y += pad;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = y;
  const oc = out.getContext("2d")!;
  oc.fillStyle = "#ffffff";
  oc.fillRect(0, 0, out.width, out.height);
  oc.drawImage(canvas, 0, 0);
  return out;
}

/**
 * Ukuran halaman PDF struk. `a4` = 210 mm (A4), `a5` dan `a4_a5` (preset lama, tetap dipetakan ke A5) = 148 mm.
 * Dipisah sebagai fungsi murni agar dapat diuji.
 */
export function receiptPdfPage(preset: string): { width: number; format: "a4" | "a5" | [number, number] } {
  if (preset === "a4") return { width: 210, format: "a4" };
  if (preset === "a5" || preset === "a4_a5") return { width: 148, format: "a5" };
  if (preset === "58mm") return { width: 58, format: [58, 240] };
  if (preset === "80mm") return { width: 80, format: [80, 240] };
  return { width: 148, format: [148, 240] };
}

/* ───────── Download Entrypoints (Lazy-loaded jsPDF / ExcelJS) ───────── */
export async function downloadReceiptFile(
  snap: ReceiptSnapshot,
  format: "pdf" | "jpg" | "png",
  preset: string,
  overrides: TemplateOverrides = {},
) {
  const filename = receiptFilename(snap.invoiceNumber, preset, format);
  return runWithDownloadProgress(`Struk ${snap.invoiceNumber}`, format, async (setStep) => {
    setStep(`Merender struk (${format.toUpperCase()})…`, 50);
  if (format === "png" || format === "jpg") {
    const canvas = renderReceiptToCanvas(snap, preset, overrides);
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), mime, 0.94));
    triggerBlobDownload(blob, filename);
    return;
  }

  const { jsPDF } = await import("jspdf");
  const is58 = preset === "58mm";
  const page = receiptPdfPage(preset);
  const pageW = page.width;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: page.format });

  const pad = is58 ? 4 : 8;
  let y = 10;
  const center = pageW / 2;
  doc.setFontSize(is58 ? 10 : 12);
  doc.setFont("helvetica", "bold");
  doc.text((overrides.businessName || snap.businessName).toUpperCase(), center, y, { align: "center" });
  y += 5;
  doc.setFontSize(is58 ? 7 : 8.5);
  doc.setFont("helvetica", "normal");
  doc.text(overrides.address || snap.businessAddress, center, y, { align: "center", maxWidth: pageW - pad * 2 });
  y += 6;
  doc.text("Bukti Transaksi Penjualan", center, y, { align: "center" });
  y += 4;
  doc.line(pad, y, pageW - pad, y);
  y += 5;

  const row = (l: string, r: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(l, pad, y);
    doc.text(r, pageW - pad, y, { align: "right" });
    y += 4.5;
  };
  row("No. Transaksi", snap.invoiceNumber, true);
  row("Tanggal", fmtLocalDateTime(snap.issuedAt, snap.timezone));
  row("Kasir", snap.operator);
  doc.line(pad, y, pageW - pad, y);
  y += 5;

  for (const item of snap.items) {
    if (y > 215) {
      doc.addPage();
      y = 12;
    }
    doc.setFont("helvetica", "bold");
    doc.text(item.name, pad, y, { maxWidth: (pageW - pad * 2) * 0.65 });
    doc.text(fmtCentsDisplay(item.totalCents, snap.currency), pageW - pad, y, { align: "right" });
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.text(`${item.qty} x ${fmtCentsDisplay(item.unitPriceCents, snap.currency)}`, pad, y);
    y += 5;
  }
  doc.line(pad, y, pageW - pad, y);
  y += 5;
  row("Subtotal", fmtCentsDisplay(snap.subtotalCents, snap.currency));
  if (BigInt(snap.discountCents) > 0n) row("Diskon", `-${fmtCentsDisplay(snap.discountCents, snap.currency)}`);
  if (BigInt(snap.taxCents) > 0n) row("Pajak", fmtCentsDisplay(snap.taxCents, snap.currency));
  row("TOTAL", fmtCentsDisplay(snap.totalCents, snap.currency), true);
  row("Dibayar", fmtCentsDisplay(snap.paidCents, snap.currency));
  row(snap.isPartialOrDue ? "Sisa" : "Kembalian", fmtCentsDisplay(snap.changeOrDueCents, snap.currency), true);
  y += 2;
  doc.line(pad, y, pageW - pad, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(overrides.closingText || "Terima kasih telah berbelanja", center, y, { align: "center" });
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.text(`Kode verifikasi: ${snap.verificationCode}`, center, y, { align: "center" });

  beginExternalPicker(15_000);
  doc.save(filename);
  });
}

export async function downloadActivityFile(
  snap: ActivitySnapshot,
  format: "pdf" | "jpg" | "png" | "xlsx" | "csv",
  preset: string,
  overrides: TemplateOverrides = {},
) {
  const filename = activityFilename(snap.businessName, snap.from, snap.to, preset, format);
  if (format === "xlsx") {
    await downloadComprehensiveActivityExcel(snap, filename);
    return;
  }
  return runWithDownloadProgress("Business Activity Summary", format, async (setStep) => {
    setStep(`Merender laporan (${format.toUpperCase()})…`, 50);

  if (format === "csv") {
    const cols = [
      { key: "label", label: "Modul" },
      { key: "count", label: "Jumlah Aktivitas" },
      { key: "summary", label: "Ringkasan" },
    ];
    const csv = toCsv(cols, snap.modules);
    triggerBlobDownload(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), filename);
    return;
  }

  if (format === "png" || format === "jpg") {
    const canvas = renderActivityToCanvas(snap, overrides);
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), mime, 0.94));
    triggerBlobDownload(blob, filename);
    return;
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 18;
  doc.setFontSize(9);
  doc.setTextColor(24, 122, 117);
  doc.setFont("helvetica", "bold");
  doc.text("BUSINESS FLOW REPORT", 16, y);
  y += 7;
  doc.setFontSize(18);
  doc.setTextColor(32, 51, 50);
  doc.text("Business Activity Summary", 16, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(92, 110, 108);
  doc.text(`${overrides.businessName || snap.businessName} · ${snap.from} s.d. ${snap.to}`, 16, y);
  y += 8;
  doc.line(16, y, 194, y);
  y += 8;

  const kpis = [
    ["Total aktivitas", String(snap.kpis.totalActivities)],
    ["Total penjualan", fmtCentsDisplay(snap.kpis.totalSalesCents, snap.currency)],
    ["Total pemasukan", fmtCentsDisplay(snap.kpis.totalIncomeCents, snap.currency)],
    ["Total pengeluaran", fmtCentsDisplay(snap.kpis.totalExpenseCents, snap.currency)],
  ];
  for (const [label, val] of kpis) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(92, 110, 108);
    doc.text(label, 16, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(32, 51, 50);
    doc.text(val, 194, y, { align: "right" });
    y += 6;
  }
  y += 6;
  doc.setFontSize(12);
  doc.text("Ringkasan per modul", 16, y);
  y += 7;
  doc.setFontSize(10);
  for (const m of snap.modules) {
    if (y > 265) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(32, 51, 50);
    doc.text(m.label, 16, y);
    doc.setFont("helvetica", m.hasActivity ? "bold" : "normal");
    doc.setTextColor(m.hasActivity ? 24 : 137, m.hasActivity ? 122 : 150, m.hasActivity ? 117 : 148);
    doc.text(m.summary, 194, y, { align: "right" });
    y += 6.5;
  }
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 122, 117);
  doc.text("Kesimpulan aktivitas periode", 16, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(32, 51, 50);
  doc.text(snap.conclusion, 16, y, { maxWidth: 178 });
  y += 14;
  doc.setFontSize(8.5);
  doc.setTextColor(92, 110, 108);
  doc.text(`${fmtLocalDateTime(snap.generatedAt, snap.timezone)} · ${snap.branchName} · ${snap.operator} · ${snap.reportNumber} · Kode: ${snap.verificationCode}`, 16, y);

  beginExternalPicker(15_000);
  doc.save(filename);
  });
}
