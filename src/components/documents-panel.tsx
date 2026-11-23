"use client";

import { tr } from "@/lib/tr";
import { useEffect, useState } from "react";
import { api, apiBlob, fmtDate, toast, useApi } from "@/lib/client";
import { moneyText } from "@/features/documents/render";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, SelectField, TextField } from "./ui";

const err = (e: unknown) => toast((e as Error).message, "err");

const KIND_OPTIONS = [
  { value: "invoice", labelKey: "Faktur" },
  { value: "quotation", labelKey: "Penawaran" },
  { value: "receipt", labelKey: "Kuitansi" },
  { value: "delivery_note", labelKey: "Surat Jalan" },
];
const kindOptions = () => KIND_OPTIONS.map((o) => ({ value: o.value, label: tr(o.labelKey) }));

function kindLabel(kind: string): string {
  switch (kind) {
    case "invoice": return tr("Faktur");
    case "quotation": return tr("Penawaran");
    case "receipt": return tr("Kuitansi");
    case "delivery_note": return tr("Surat Jalan");
    default: return kind;
  }
}

export function DocumentsPanel() {
  const [tab, setTab] = useState<"docs" | "templates">("docs");
  const [kindFilter, setKindFilter] = useState("");
  const list = useApi<any>(`/v6/documents${kindFilter ? `?kind=${kindFilter}` : ""}`);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant={tab === "docs" ? "primary" : "secondary"} onClick={() => setTab("docs")}>{tr("Dokumen")}</Button>
          <Button variant={tab === "templates" ? "primary" : "secondary"} onClick={() => setTab("templates")}>{tr("Templat")}</Button>
        </div>
        {tab === "docs" && (
          <div className="flex flex-wrap items-end gap-2">
            <SelectField label={tr("Saring jenis")} value={kindFilter} onChange={setKindFilter} options={[{ value: "", label: tr("Semua jenis") }, ...kindOptions()]} />
            <Button onClick={() => setCreateOpen(true)}>{tr("Terbitkan dokumen")}</Button>
          </div>
        )}
      </div>

      {tab === "docs" && (
        <>
          {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loading /> : (
            <Card title={tr("Dokumen terbit")} desc={tr("Dokumen bersifat tetap setelah terbit. Koreksi dilakukan lewat pembatalan bertanda atau dokumen pengganti.")}>
              <DataTable
                rows={list.data?.items ?? []}
                caption={tr("Daftar dokumen")}
                empty={<Empty title={tr("Belum ada dokumen")} hint={tr("Terbitkan dari faktur atau penawaran yang sudah ada.")} />}
                columns={[
                  { key: "number", label: tr("Nomor") },
                  { key: "kind", label: tr("Jenis"), render: (r: any) => kindLabel(r.kind) },
                  { key: "clientName", label: tr("Kepada"), render: (r: any) => r.clientName ?? "—" },
                  { key: "totalCents", label: tr("Total"), right: true, render: (r: any) => (r.totalCents ? moneyText(String(r.totalCents), r.currency ?? "IDR") : "—") },
                  { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status === "voided" ? "reversed" : "paid"}>{r.status === "voided" ? tr("Dibatalkan") : tr("Terbit")}</Badge> },
                  { key: "issuedAt", label: tr("Tanggal"), render: (r: any) => fmtDate(r.issuedAt) },
                  { key: "act", label: "", render: (r: any) => (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setPreviewId(r.id)}>{tr("Pratinjau")}</Button>
                      {r.status === "issued" && <VoidButton id={r.id} onDone={list.reload} />}
                    </div>
                  ) },
                ]}
              />
            </Card>
          )}
        </>
      )}

      {tab === "templates" && <TemplatesPanel />}

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); list.reload(); }} />}
      {previewId && <PreviewModal id={previewId} onClose={() => setPreviewId(null)} />}
    </div>
  );
}

function VoidButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/v6/documents/${id}/void`, { method: "POST", body: { reason } });
      toast(tr("Dokumen dibatalkan"), "ok");
      setOpen(false);
      onDone();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>{tr("Batalkan")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Batalkan dokumen")}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{tr("Batal")}</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => void submit()}>{tr("Batalkan dokumen")}</Button></>}>
        <TextField label={tr("Alasan pembatalan *")} value={reason} onChange={setReason} help={tr("Dokumen tidak dihapus; hanya ditandai batal agar jejak tetap ada.")} />
      </Modal>
    </>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState("invoice");
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const invoices = useApi<any>(kind === "quotation" ? null : "/sales/invoices");
  const quotations = useApi<any>(kind === "quotation" ? "/p2/quotations" : null);
  const sources: any[] = kind === "quotation" ? (quotations.data?.items ?? []) : (invoices.data?.items ?? []);

  const submit = async () => {
    if (!sourceId) { toast(tr("Pilih sumber lebih dulu."), "err"); return; }
    setBusy(true);
    try {
      const res = await api<any>("/v6/documents", { method: "POST", body: { kind, sourceId }, idem: `doc-${kind}-${sourceId}` });
      toast(`${tr("Dokumen terbit")}: ${res.number}`, "ok");
      onDone();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={tr("Terbitkan dokumen")}
      footer={<><Button variant="secondary" onClick={onClose}>{tr("Tutup")}</Button><Button loading={busy} onClick={() => void submit()}>{tr("Terbitkan")}</Button></>}>
      <div className="grid gap-3">
        <SelectField label={tr("Jenis dokumen")} value={kind} onChange={(v) => { setKind(v); setSourceId(""); }} options={kindOptions()} />
        <SelectField
          label={kind === "quotation" ? tr("Penawaran sumber *") : tr("Faktur sumber *")}
          value={sourceId}
          onChange={setSourceId}
          placeholder={tr("Pilih sumber...")}
          options={sources.map((s: any) => ({ value: s.id, label: `${s.number}${s.total ? ` · ${s.total}` : ""}` }))}
        />
        <p className="text-xs text-ink-2">{tr("Nomor dokumen dialokasikan tanpa celah per jenis. Kuitansi dan surat jalan mengambil baris dari faktur sumber.")}</p>
      </div>
    </Modal>
  );
}

function PreviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    apiBlob(`/v6/documents/${id}/pdf`)
      .then((blob) => {
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        revoke = u;
        setUrl(u);
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [id]);

  return (
    <Modal open onClose={onClose} title={tr("Pratinjau dokumen (PDF)")} wide
      footer={<><span className="mr-auto text-xs text-ink-2">{tr("Pratinjau adalah berkas PDF yang sama dengan yang diunduh.")}</span>
        {url && <a className="inline-flex min-h-[44px] items-center rounded-xl bg-[var(--color-action)] px-4 text-sm font-semibold text-white" href={url} download={`${id}.pdf`}>{tr("Unduh PDF")}</a>}
        <Button variant="secondary" onClick={onClose}>{tr("Tutup")}</Button></>}>
      {error ? <ErrorBox message={error} /> : !url ? <Loading text={tr("Menyiapkan PDF...")} /> : (
        <iframe title={tr("Pratinjau dokumen")} src={url} className="h-[70vh] w-full rounded-xl border border-line bg-white" />
      )}
    </Modal>
  );
}

function TemplatesPanel() {
  const list = useApi<any>("/v6/documents/templates");
  return (
    <Card title={tr("Templat dokumen (berversi)")} desc={tr("Kop memakai identitas bisnis Anda. Setiap perubahan menghasilkan versi baru; dokumen lama menyimpan versi yang dipakainya.")}>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loading /> : (
        <DataTable
          rows={list.data?.items ?? []}
          caption={tr("Templat per jenis")}
          columns={[
            { key: "kind", label: tr("Jenis"), render: (r: any) => kindLabel(r.kind) },
            { key: "version", label: tr("Versi"), render: (r: any) => `v${r.version}` },
            { key: "paper", label: tr("Ukuran"), render: (r: any) => String(r.config?.paper ?? "a4").toUpperCase() },
            { key: "prices", label: tr("Tampilkan harga"), render: (r: any) => (r.config?.showPrices ? tr("Ya") : tr("Tidak")) },
            { key: "footer", label: tr("Kaki dokumen"), render: (r: any) => <span className="text-xs text-ink-2">{r.config?.footer}</span> },
            { key: "act", label: "", render: (r: any) => <TemplateEditor kind={r.kind} config={r.config} onDone={list.reload} /> },
          ]}
        />
      )}
    </Card>
  );
}

function TemplateEditor({ kind, config, onDone }: { kind: string; config: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [footer, setFooter] = useState(String(config?.footer ?? ""));
  const [paper, setPaper] = useState(String(config?.paper ?? "a4"));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/v6/documents/templates/${kind}`, { method: "PATCH", body: { key: "standard", footer, paper } });
      toast(tr("Templat tersimpan (versi baru)"), "ok");
      setOpen(false);
      onDone();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>{tr("Ubah")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${tr("Templat")} ${kindLabel(kind)}`}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{tr("Batal")}</Button><Button loading={busy} onClick={() => void submit()}>{tr("Simpan versi baru")}</Button></>}>
        <div className="grid gap-3">
          <SelectField label={tr("Ukuran kertas")} value={paper} onChange={setPaper} options={[{ value: "a4", label: "A4" }, { value: "a5", label: "A5" }]} />
          <TextField label={tr("Kaki dokumen")} value={footer} onChange={setFooter} />
        </div>
      </Modal>
    </>
  );
}
