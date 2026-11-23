"use client";
 
import { tr } from "@/lib/tr";
import { useRef, useState } from "react";
import { api, fmtDateTime, getTab, toast, useApi } from "@/lib/client";
import { useConfirm } from "./confirm-dialog";
import { beginExternalPicker } from "./lock-provider";
import { Button, Card, DataTable, ErrorBox, Loading } from "./ui";

export function AttachmentsPanel({
  entityType,
  entityId,
  title = "Dokumen & Lampiran",
  canWrite = true,
}: {
  entityType: "client" | "payment" | "task" | "business_logo" | "asset";
  entityId: string | null;
  title?: string;
  canWrite?: boolean;
}) {
  const { data, error, loading, reload } = useApi<any>(
    entityId ? `/files?entityType=${entityType}&entityId=${entityId}` : `/files?entityType=${entityType}`,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, ConfirmUI } = useConfirm();

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast("Ukuran berkas maksimal 3 MB.", "err");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      await api("/files", {
        body: {
          entityType,
          entityId,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          base64,
        },
      });
      toast(tr("Berkas berhasil diunggah"));
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function download(id: string, filename: string) {
    beginExternalPicker(15_000);
    try {
      const headers: Record<string, string> = { "x-requested-with": "bf" };
      const tab = getTab();
      if (tab) headers["x-tab-session"] = tab;
      const res = await fetch(`/api/v1/files/${id}/download`, { headers, credentials: "same-origin" });
      if (!res.ok) throw new Error("Gagal mengunduh berkas");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function remove(id: string, filename: string) {
    if (!(await confirm({ title: tr("Hapus Berkas"), message: `Hapus "${filename}"?`, confirmLabel: "Hapus" }))) return;
    try {
      await api(`/files/${id}`, { method: "DELETE" });
      toast(tr("Berkas dihapus"));
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <Loading />;

  return (
    <>
      {ConfirmUI}
      <Card
        title={title}
        desc={tr("Mendukung PDF, PNG, JPG, WEBP, CSV, TXT (maks. 3 MB).")}
        actions={
          canWrite ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"
                className="sr-only"
                onChange={(e) => void onPick(e.target.files?.[0])}
              />
              <Button
                loading={busy}
                onClick={() => {
                  beginExternalPicker(30_000);
                  inputRef.current?.click();
                }}
              >
                + Unggah Berkas
              </Button>
            </>
          ) : undefined
        }
      >
        <DataTable
          rows={data?.items ?? []}
          caption={title}
          empty={tr("Belum ada berkas terlampir.")}
          columns={[
            { key: "filename", label: tr("Nama Berkas") },
            { key: "mime", label: tr("Tipe") },
            { key: "sizeBytes", label: tr("Ukuran"), right: true, render: (r: any) => `${Math.ceil(r.sizeBytes / 1024)} KB` },
            { key: "createdAt", label: tr("Diunggah"), render: (r: any) => fmtDateTime(r.createdAt) },
            {
              key: "a",
              label: "",
              render: (r: any) => (
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" className="!min-h-[32px] !px-2.5 text-xs" onClick={() => void download(r.id, r.filename)}>
                    Unduh
                  </Button>
                  {canWrite && (
                    <Button variant="ghost" className="!min-h-[32px] !px-2.5 text-xs !text-[var(--color-danger-strong)]" onClick={() => void remove(r.id, r.filename)}>
                      Hapus
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
