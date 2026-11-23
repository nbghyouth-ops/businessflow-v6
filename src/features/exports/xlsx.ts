/**
 * Penulis XLSX bergaya (R11-D §T5).
 *
 * Palet diukur dari PNG referensi pemilik (lihat `spec.ts`). Sel uang ditulis sebagai
 * TEKS desimal eksak (`numFmt "@"`, rata kanan) — bukan angka floating point — sehingga
 * nilainya identik per sel dengan CSV dan tidak pernah kehilangan presisi.
 */
import ExcelJS from "exceljs";
import { PALETTE, type ExportRow, type SheetPart } from "./spec";
import { neutralizeFormula } from "./csv";

export type WorkbookMeta = {
  title: string;
  businessName: string;
  from: string;
  to: string;
  currency: string;
  generatedAt: string;
};

function argb(hex: string): string {
  return `FF${hex}`;
}

function styleHeader(row: ExcelJS.Row, accent: string): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(accent) } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: argb(PALETTE.graySoft) } } };
  });
}

/** Bangun workbook multi-lembar dari spec + baris teks. */
export async function buildXlsxWorkbook(parts: SheetPart[], meta: WorkbookMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Business Flow";
  wb.created = new Date(meta.generatedAt);

  for (const part of parts) {
    const { spec, rows } = part;
    const ws = wb.addWorksheet(spec.title, { views: [{ state: "frozen", ySplit: 3 }] });
    ws.columns = spec.columns.map((c) => ({ width: c.width }));

    const title = ws.addRow([`${spec.title.toUpperCase()} — ${meta.businessName}`]);
    title.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(spec.accent) } };
    title.height = 22;
    ws.mergeCells(title.number, 1, title.number, spec.columns.length);

    const metaRow = ws.addRow([`Periode ${meta.from} s.d. ${meta.to} · ${meta.currency} · dibuat ${meta.generatedAt}`]);
    metaRow.font = { size: 9, color: { argb: argb(PALETTE.ink) } };
    metaRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("FFF8F8F8") } };
    ws.mergeCells(metaRow.number, 1, metaRow.number, spec.columns.length);

    styleHeader(ws.addRow(spec.columns.map((c) => c.header)), spec.accent);
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: spec.columns.length } };

    for (const row of rows) {
      // Teks selalu dinetralkan; angka/uang negatif tetap utuh (lihat neutralizeFormula).
      const values = spec.columns.map((c) => neutralizeFormula(row[c.key] ?? ""));
      const added = ws.addRow(values);
      spec.columns.forEach((c, index) => {
        const cell = added.getCell(index + 1);
        if (c.type === "money" || c.type === "count") {
          cell.alignment = { horizontal: "right" };
          cell.numFmt = "@"; // teks eksak: tidak ada pembulatan floating point
        }
        if (c.type === "date") cell.alignment = { horizontal: "left" };
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

/** Pembaca ulang untuk uji: nilai sel sebagai teks (dipakai uji paritas). */
export type XlsxCellRow = Record<string, string>;
