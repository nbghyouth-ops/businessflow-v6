"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useBiz } from "@/components/shell";
import { apiFile, toast } from "@/lib/client";
import { tr } from "@/lib/tr";

type ReportKey = "marketplace" | "revenue" | "pnl" | "all";

/**
 * Tombol unduh ekspor laporan (R11-D §T5).
 *
 * XLSX = beberapa lembar bergaya untuk dibaca manusia; CSV (ZIP) = datar, untuk alat lain.
 * Angka di kedua format berasal dari sel yang sama (uji paritas), dan izin mengikuti
 * `export:create` (owner & manager; lihat MATRIKS_IZIN.md).
 */
export function ReportExportCard({ report, from, to }: { report: ReportKey; from: string; to: string }) {
  const biz = useBiz();
  const allowed = biz.can("export:create");
  const [busy, setBusy] = useState<null | "xlsx" | "csv">(null);

  async function run(format: "xlsx" | "csv") {
    setBusy(format);
    try {
      const { blob, filename, rows } = await apiFile("/exports/reports", { report, format, from, to });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast(`${tr("Berkas dibuat")}: ${filename}${rows === null ? "" : ` · ${rows} ${tr("baris")}`}`);
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      className="mb-6"
      title={tr("Ekspor laporan")}
      desc={tr(
        "XLSX berisi beberapa lembar bergaya (Marketplace, Revenue, Laba Rugi, Bank, Settlement) untuk dibaca manusia; CSV adalah data datar dalam satu ZIP untuk diolah alat lain. Angka kedua format identik.",
      )}
    >
      {allowed ? (
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === "xlsx"} onClick={() => void run("xlsx")}>
            {tr("Unduh XLSX")}
          </Button>
          <Button variant="secondary" loading={busy === "csv"} onClick={() => void run("csv")}>
            {tr("Unduh CSV (ZIP)")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-2">{tr("Peran Anda tidak memiliki izin ekspor.")}</p>
      )}
      <p className="mt-3 text-xs text-ink-2">
        {tr("Batas satu berkas: 50.000 baris. Bila periode Anda lebih besar, pecah menjadi beberapa periode.")}
      </p>
    </Card>
  );
}
