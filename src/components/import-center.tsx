"use client";
 
import { tr } from "@/lib/tr";
import { useRef, useState } from "react";
import { api, fmtDateTime, toast, useApi } from "@/lib/client";
import { useConfirm } from "./confirm-dialog";
import { beginExternalPicker } from "./lock-provider";
import { Badge, Button, Card, DataTable, SelectField } from "./ui";
import { IMPORT_TARGETS, importTarget, type ImportTargetKey } from "@/lib/import-targets";

function parseCsvSimple(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitRow = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitRow(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = splitRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? "";
    });
    return obj;
  });
}

type DryRun = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rows: Array<{ rowNo: number; status: string; error?: string; data: Record<string, string> }>;
};

export function ImportCenter() {
  const { data, reload } = useApi<any>("/p2/imports");
  const [target, setTarget] = useState<ImportTargetKey>("clients");
  const [filename, setFilename] = useState("");
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmUI } = useConfirm();

  /** Validasi kering di server: TIDAK menulis apa pun ke database. */
  async function runDryRun(rows: Record<string, string>[], nextTarget: ImportTargetKey) {
    if (!rows.length) {
      setDryRun(null);
      return;
    }
    try {
      const r = await api<DryRun>("/v6/imports/preview", { method: "POST", body: { target: nextTarget, rows } });
      setDryRun(r);
    } catch (e) {
      setDryRun(null);
      toast((e as Error).message, "err");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvSimple(text);
    setFilename(file.name);
    setPreviewRows(rows);
    if (!rows.length) {
      setDryRun(null);
      toast("CSV kosong atau tidak memiliki header + baris data.", "err");
      return;
    }
    if (rows.length > 2000) {
      setDryRun(null);
      toast("Maksimal 2.000 baris per berkas. Pecah berkas lalu ulangi.", "err");
      return;
    }
    await runDryRun(rows, target);
  }

  function changeTarget(v: ImportTargetKey) {
    setTarget(v);
    setDryRun(null);
    if (previewRows.length) void runDryRun(previewRows, v);
  }

  /** Templat CSV 11 target — dibuat di browser dari registry, tanpa unduhan server. */
  function downloadTemplate() {
    const def = importTarget(target);
    if (!def) return;
    const blob = new Blob([def.sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `templat-impor-${def.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function commit() {
    if (!previewRows.length) return;
    setBusy(true);
    try {
      const r = await api<any>("/p2/imports/commit", {
        body: { target, filename: filename || "import.csv", rows: previewRows },
      });
      toast(`Impor selesai: ${r.importedRows} berhasil, ${r.errorRows} gagal`);
      setPreviewRows([]);
      setDryRun(null);
      setFilename("");
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function rollback(id: string) {
    if (!(await confirm({ title: tr("Rollback Impor"), message: tr("Hapus semua baris yang diimpor pada batch ini?"), confirmLabel: "Rollback" }))) {
      return;
    }
    try {
      const r = await api<any>(`/p2/imports/${id}/rollback`, { body: {} });
      toast(`Rollback berhasil (${r.rolledBackCount} baris dihapus)`);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <>
      {ConfirmUI}
      <Card
        title={tr("Import / Migration Center (CSV + Rollback)")}
        desc={tr("Pratinjau baris per baris sebelum disimpan. Setiap batch dapat di-rollback bila terjadi kesalahan.")}
      >
        <div className="grid gap-3 sm:grid-cols-[240px_1fr_auto] sm:items-end">
          <SelectField
            label={tr("Target data")}
            value={target}
            onChange={(v) => changeTarget(v as ImportTargetKey)}
            options={IMPORT_TARGETS.map((t) => ({
              value: t.key,
              label: `${t.label} (${t.columns.join(", ")})`,
            }))}
          />
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              aria-label={tr("Pilih berkas CSV untuk diimpor")}
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              onClick={() => {
                beginExternalPicker(30_000);
                inputRef.current?.click();
              }}
            >
              Pilih Berkas CSV {filename ? `(${filename})` : ""}
            </Button>
            <Button variant="ghost" className="mt-1 !min-h-[36px] !px-2 text-xs" onClick={downloadTemplate}>
              Unduh templat {importTarget(target)?.label ?? ""}
            </Button>
          </div>
          {previewRows.length > 0 && (
            <Button loading={busy} disabled={!dryRun || dryRun.valid === 0} onClick={() => void commit()}>
              Konfirmasi &amp; impor {dryRun?.valid ?? previewRows.length} baris
            </Button>
          )}
        </div>

        {dryRun && (
          <div className="mt-4 space-y-3">
            <p
              role="status"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink-main"
            >
              Validasi kering selesai — <strong>belum ada data yang ditulis</strong>. Periksa hasil di bawah, lalu
              konfirmasi untuk menyimpan.
            </p>
            <ul className="flex flex-wrap gap-2 text-xs">
              <li className="rounded-full border border-line px-3 py-1">Total: {dryRun.total}</li>
              <li className="rounded-full border border-line px-3 py-1">Valid: {dryRun.valid}</li>
              <li className="rounded-full border border-line px-3 py-1">Duplikat: {dryRun.duplicates}</li>
              <li className="rounded-full border border-line px-3 py-1">Galat: {dryRun.invalid}</li>
            </ul>
            {dryRun.rows.some((r) => r.status !== "valid") && (
              <div className="max-h-56 overflow-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">{tr("Baris yang perlu diperbaiki")}</caption>
                  <thead className="bg-surface">
                    <tr>
                      <th scope="col" className="px-3 py-2">{tr("Baris")}</th>
                      <th scope="col" className="px-3 py-2">{tr("Status")}</th>
                      <th scope="col" className="px-3 py-2">{tr("Keterangan")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRun.rows
                      .filter((r) => r.status !== "valid")
                      .slice(0, 50)
                      .map((r) => (
                        <tr key={r.rowNo} className="border-t border-line">
                          <td className="px-3 py-2">{r.rowNo}</td>
                          <td className="px-3 py-2">{r.status === "duplicate" ? "Duplikat" : "Galat"}</td>
                          <td className="px-3 py-2">{r.error ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-ink-main">
                Lihat 5 baris pertama berkas
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-xl border border-line bg-surface p-3 text-xs">
                {JSON.stringify(previewRows.slice(0, 5), null, 2)}
              </pre>
            </details>
          </div>
        )}

        <div className="mt-5">
          <DataTable
            rows={data?.items ?? []}
            caption={tr("Riwayat batch impor")}
            empty={tr("Belum ada riwayat impor.")}
            columns={[
              { key: "filename", label: tr("Berkas") },
              { key: "target", label: tr("Target") },
              { key: "importedRows", label: tr("Masuk"), right: true },
              { key: "errorRows", label: tr("Galat"), right: true },
              { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
              { key: "createdAt", label: tr("Waktu"), render: (r: any) => fmtDateTime(r.createdAt) },
              {
                key: "a",
                label: "",
                render: (r: any) =>
                  r.status === "committed" ? (
                    <Button variant="ghost" className="!min-h-[32px] !px-2 text-xs !text-[var(--color-danger-strong)]" onClick={() => void rollback(r.id)}>
                      Rollback
                    </Button>
                  ) : null,
              },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
