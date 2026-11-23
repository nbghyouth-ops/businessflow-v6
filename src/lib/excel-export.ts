"use client";
import { runWithDownloadProgress } from "@/components/download-loader";
import type { ActivitySnapshot } from "@/server/routes/exports";

function centsToNumber(centsStr: string): number {
  const n = Number(centsStr || "0") / 100;
  return Number.isFinite(n) ? n : 0;
}

function triggerBlobDownload(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function styleHeaderRow(row: { eachCell: (cb: (cell: Record<string, unknown>) => void) => void }, bgHex = "141518") {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bgHex}` } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
}

/** Ekspor Excel (.xlsx) Rangkuman Keseluruhan Bisnis multi-sheet dengan styling rapi dan rumus SUM aktif. */
export async function downloadComprehensiveActivityExcel(
  snap: ActivitySnapshot,
  filename: string,
  series?: { day: string; income: string | number; expense: string | number }[],
) {
  await runWithDownloadProgress("Rangkuman Keseluruhan Bisnis", "XLSX", async (setStep) => {
    setStep("Menyusun workbook Excel…", 42);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Business Flow";
    wb.created = new Date();

    const moneyFmt = snap.currency === "IDR" ? '#,##0;-#,##0;"-"' : '#,##0.00;-#,##0.00;"-"';

    // Sheet 1: Ringkasan Eksekutif
    const ws1 = wb.addWorksheet("Ringkasan Eksekutif", { views: [{ state: "frozen", ySplit: 4 }] });
    ws1.columns = [{ width: 32 }, { width: 28 }, { width: 28 }];
    ws1.addRow(["BUSINESS FLOW — RANGKUMAN EKSEKUTIF"]).font = { bold: true, size: 15, color: { argb: "FF2A3BD4" } };
    ws1.addRow(["Nama Usaha", snap.businessName, `Cabang: ${snap.branchName}`]);
    ws1.addRow(["Periode", `${snap.from} s.d. ${snap.to}`, `Dibuat: ${new Date().toLocaleDateString("id-ID")}`]);
    ws1.addRow([]);

    const h1 = ws1.addRow(["Indikator Utama", "Nilai", "Keterangan"]);
    styleHeaderRow(h1 as never);
    const kpiRows = [
      ["Total Aktivitas Tercatat", snap.kpis.totalActivities, "Jumlah event lintas modul"],
      ["Total Penjualan", centsToNumber(snap.kpis.totalSalesCents), `${snap.currency} (Faktur valid)`],
      ["Total Pemasukan", centsToNumber(snap.kpis.totalIncomeCents), `${snap.currency} (Jurnal posted)`],
      ["Total Pengeluaran", centsToNumber(snap.kpis.totalExpenseCents), `${snap.currency} (Jurnal posted)`],
      [
        "Arus Kas Bersih",
        centsToNumber(snap.kpis.totalIncomeCents) - centsToNumber(snap.kpis.totalExpenseCents),
        "Pemasukan dikurangi pengeluaran",
      ],
    ];
    kpiRows.forEach((r, idx) => {
      const row = ws1.addRow(r);
      if (idx > 0) row.getCell(2).numFmt = moneyFmt;
    });
    ws1.addRow([]);
    const conc = ws1.addRow(["Kesimpulan Periode", snap.conclusion]);
    conc.getCell(1).font = { bold: true };
    ws1.mergeCells(`B${conc.number}:C${conc.number}`);
    conc.getCell(2).alignment = { wrapText: true };

    // Sheet 2: Rekap 9 Modul
    setStep("Memformat rekap per modul…", 65);
    const ws2 = wb.addWorksheet("Rekap Per Modul", { views: [{ state: "frozen", ySplit: 2 }] });
    ws2.columns = [{ width: 6 }, { width: 28 }, { width: 14 }, { width: 46 }];
    ws2.addRow(["RINGKASAN AKTIVITAS PER MODUL"]).font = { bold: true, size: 13, color: { argb: "FF2A3BD4" } };
    const h2 = ws2.addRow(["No", "Modul", "Jumlah", "Rangkuman Aktual"]);
    styleHeaderRow(h2 as never, "2A3BD4");
    snap.modules.forEach((m, i) => {
      ws2.addRow([i + 1, m.label, m.count, m.summary]);
    });

    // Sheet 3: Catatan Keuangan Harian (jika ada series)
    if (series && series.length > 0) {
      setStep("Menambahkan catatan keuangan harian…", 82);
      const ws3 = wb.addWorksheet("Catatan Keuangan", { views: [{ state: "frozen", ySplit: 2 }] });
      ws3.columns = [{ width: 16 }, { width: 22 }, { width: 22 }, { width: 22 }];
      ws3.addRow([`CATATAN ARUS KAS HARIAN (${snap.currency})`]).font = { bold: true, size: 13, color: { argb: "FF2A3BD4" } };
      const h3 = ws3.addRow(["Tanggal", "Pendapatan", "Beban", "Selisih Bersih"]);
      styleHeaderRow(h3 as never, "141518");
      const startRow = 3;
      series.forEach((s) => {
        const inc = Number(s.income || 0);
        const exp = Number(s.expense || 0);
        const r = ws3.addRow([s.day, inc, exp, { formula: `B${ws3.rowCount + 1}-C${ws3.rowCount + 1}` }]);
        r.getCell(2).numFmt = moneyFmt;
        r.getCell(3).numFmt = moneyFmt;
        r.getCell(4).numFmt = moneyFmt;
      });
      const endRow = ws3.rowCount;
      const tot = ws3.addRow([
        "TOTAL",
        { formula: `SUM(B${startRow}:B${endRow})` },
        { formula: `SUM(C${startRow}:C${endRow})` },
        { formula: `SUM(D${startRow}:D${endRow})` },
      ]);
      tot.font = { bold: true };
      [2, 3, 4].forEach((c) => {
        tot.getCell(c).numFmt = moneyFmt;
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    triggerBlobDownload(buf as ArrayBuffer, filename);
  });
}

/** Template Excel Catatan Keuangan Siap Pakai (Buku Kas & Bank dengan rumus Saldo Berjalan otomatis). */
export async function downloadFinanceTemplateExcel(businessName: string, currency = "IDR") {
  const safe = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bisnis";
  const filename = `template-catatan-keuangan-${safe}.xlsx`;

  await runWithDownloadProgress("Template Catatan Keuangan Excel", "XLSX", async (setStep) => {
    setStep("Membuat template buku kas rapi…", 45);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Business Flow";
    wb.created = new Date();

    const moneyFmt = currency === "IDR" ? '#,##0;-#,##0;"-"' : '#,##0.00;-#,##0.00;"-"';
    const ws = wb.addWorksheet("Buku Kas & Bank", { views: [{ state: "frozen", ySplit: 5 }] });
    ws.columns = [
      { width: 14 },
      { width: 16 },
      { width: 22 },
      { width: 34 },
      { width: 18 },
      { width: 18 },
      { width: 20 },
    ];

    ws.addRow([`TEMPLATE CATATAN KEUANGAN — ${businessName.toUpperCase()}`]).font = { bold: true, size: 14, color: { argb: "FF2A3BD4" } };
    ws.addRow(["Mata Uang:", currency, "Catatan:", "Isi Pemasukan atau Pengeluaran; Saldo terhitung otomatis."]);
    ws.addRow(["Saldo Awal:", 0]);
    ws.getRow(3).getCell(2).numFmt = moneyFmt;
    ws.addRow([]);

    const hdr = ws.addRow(["Tanggal", "No. Bukti", "Kategori", "Keterangan", "Pemasukan", "Pengeluaran", "Saldo Berjalan"]);
    styleHeaderRow(hdr as never, "2A3BD4");

    setStep("Menyiapkan rumus saldo & contoh baris…", 75);
    // 25 baris siap isi dengan rumus saldo berjalan
    for (let i = 0; i < 25; i++) {
      const rNum = 6 + i;
      const prevSaldo = i === 0 ? "B3" : `G${rNum - 1}`;
      const row = ws.addRow([
        i === 0 ? new Date().toISOString().slice(0, 10) : "",
        i === 0 ? "KAS-001" : "",
        i === 0 ? "Pendapatan Penjualan" : "",
        i === 0 ? "Contoh transaksi (silakan ganti/hapus)" : "",
        0,
        0,
        { formula: `${prevSaldo}+E${rNum}-F${rNum}` },
      ]);
      row.getCell(5).numFmt = moneyFmt;
      row.getCell(6).numFmt = moneyFmt;
      row.getCell(7).numFmt = moneyFmt;
    }

    const totalRow = ws.addRow([
      "TOTAL",
      "",
      "",
      "",
      { formula: "SUM(E6:E30)" },
      { formula: "SUM(F6:F30)" },
      { formula: "G30" },
    ]);
    totalRow.font = { bold: true };
    [5, 6, 7].forEach((c) => {
      totalRow.getCell(c).numFmt = moneyFmt;
    });

    const guide = wb.addWorksheet("Panduan & Kategori");
    guide.columns = [{ width: 28 }, { width: 52 }];
    const gh = guide.addRow(["Bagian", "Petunjuk Penggunaan"]);
    styleHeaderRow(gh as never, "141518");
    guide.addRow(["1. Saldo Awal", "Ubah angka pada sel B3 di sheet Buku Kas & Bank sesuai saldo awal kas Anda."]);
    guide.addRow(["2. Pencatatan Harian", "Isi kolom Pemasukan atau Pengeluaran; kolom Saldo Berjalan otomatis menghitung."]);
    guide.addRow(["3. Kategori Disarankan", "Pendapatan Penjualan, Pendapatan Jasa, HPP, Gaji, Sewa, Utilitas, Pemasaran."]);

    const buf = await wb.xlsx.writeBuffer();
    triggerBlobDownload(buf as ArrayBuffer, filename);
  });
}

/** Ekspor Excel (.xlsx) umum untuk tabel laporan akuntansi (Laba Rugi, Neraca, Arus Kas, Buku Besar). */
export async function downloadTableExcel(
  title: string,
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  currency = "IDR",
) {
  await runWithDownloadProgress(title, "XLSX", async (setStep) => {
    setStep("Menyusun tabel Excel…", 55);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Business Flow";
    const ws = wb.addWorksheet("Laporan", { views: [{ state: "frozen", ySplit: 3 }] });
    ws.columns = headers.map((_, idx) => ({ width: idx === 0 ? 28 : 20 }));
    ws.addRow([title]).font = { bold: true, size: 13, color: { argb: "FF2A3BD4" } };
    ws.addRow([`Diekspor: ${new Date().toLocaleString("id-ID")} · Mata Uang: ${currency}`]);
    const h = ws.addRow(headers);
    styleHeaderRow(h as never, "2A3BD4");
    const moneyFmt = currency === "IDR" ? '#,##0;-#,##0;"-"' : '#,##0.00;-#,##0.00;"-"';
    rows.forEach((r) => {
      const added = ws.addRow(r);
      r.forEach((val, idx) => {
        if (typeof val === "number") added.getCell(idx + 1).numFmt = moneyFmt;
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    triggerBlobDownload(buf as ArrayBuffer, filename);
  });
}
