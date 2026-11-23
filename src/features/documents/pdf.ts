/**
 * Penulis PDF minimal murni (tanpa pustaka/layanan eksternal) untuk DOKUMEN SERVER.
 *
 * Cukup untuk dokumen teks (faktur/penawaran/kuitansi/surat jalan): halaman A4/A5,
 * font standar PDF (Helvetica/Helvetica-Bold), teks rata kiri/kanan/tengah, pagination.
 * Stream tidak dikompresi agar isi PDF dapat diperiksa teksnya oleh tes & audit.
 *
 * Catatan keamanan/kerapian:
 * - Semua teks di-escape dan dipetakan ke ASCII (WinAnsi) supaya tidak ada byte rusak.
 * - Tidak ada gambar/tautan/JavaScript di dalam PDF; dokumen ini murni teks.
 */

export type PdfPaper = "a4" | "a5";

/** Ukuran titik (points) sesuai standar PDF (1 pt = 1/72 inci). */
export const PAPER: Record<PdfPaper, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  a5: { width: 419.53, height: 595.28 },
};

export type PdfRun = {
  text: string;
  size: number;
  bold: boolean;
  align: "left" | "right" | "center";
  /** Koordinat dari kiri (x) dan dari ATAS halaman (top) dalam poin. */
  x: number;
  top: number;
};

export type PdfPage = { paper: PdfPaper; runs: PdfRun[] };

/**
 * Lebar perkiraan teks (Helvetica) tanpa tabel metrik penuh. Rata-rata 0.52 em untuk
 * regular dan 0.56 em untuk bold — cukup untuk pemenggalan baris dokumen.
 */
export function textWidth(text: string, size: number, bold = false): number {
  return text.length * size * (bold ? 0.56 : 0.52);
}

/** Memetakan karakter ke ASCII aman PDF dan meng-escape kurung/backslash. */
export function pdfEscape(input: string): string {
  const mapped = String(input ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u00b7]/g, "-");
  let out = "";
  for (const ch of mapped) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 0x5c) out += "\\\\";
    else if (code === 0x28) out += "\\(";
    else if (code === 0x29) out += "\\)";
    else if (code >= 32 && code <= 126) out += ch;
    else out += "?";
  }
  return out;
}

function num(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function contentStream(page: PdfPage): string {
  const { height } = PAPER[page.paper];
  let s = "";
  for (const r of page.runs) {
    const width = textWidth(r.text, r.size, r.bold);
    let x = r.x;
    if (r.align === "right") x = r.x - width;
    else if (r.align === "center") x = r.x - width / 2;
    const y = height - r.top;
    s += `BT /${r.bold ? "F2" : "F1"} ${num(r.size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm (${pdfEscape(r.text)}) Tj ET\n`;
  }
  return s;
}

/** Merakit byte PDF dari daftar halaman. */
export function buildPdf(pages: PdfPage[], meta: { title: string; author?: string; subject?: string }): Uint8Array {
  const objects: string[] = [];
  const pageCount = pages.length;
  // 1: catalog, 2: pages, 3: font regular, 4: font bold, lalu 2 objek per halaman.
  const pageObjId = (i: number) => 5 + i * 2;
  const contentObjId = (i: number) => 6 + i * 2;

  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  const kids = pages.map((_, i) => `${pageObjId(i)} 0 R`).join(" ");
  objects[1] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  objects[2] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

  pages.forEach((page, i) => {
    const { width, height } = PAPER[page.paper];
    objects[pageObjId(i) - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId(i)} 0 R >>`;
    const stream = contentStream(page);
    objects[contentObjId(i) - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
  });

  const infoId = 5 + pageCount * 2;
  objects[infoId - 1] =
    `<< /Title (${pdfEscape(meta.title)}) /Author (${pdfEscape(meta.author ?? "Business Flow")}) ` +
    `/Subject (${pdfEscape(meta.subject ?? "")}) /Producer (Business Flow) >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets[i] = out.length;
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = out.length;
  const total = objects.length + 1;
  out += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 0; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${total} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/** Ekstraksi teks dari PDF tak-terkompresi (dipakai tes & audit isi dokumen). */
export function pdfPlainText(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  const lines: string[] = [];
  const re = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    lines.push(m[1].replace(/\\([\\()])/g, "$1"));
  }
  return lines.join("\n");
}
