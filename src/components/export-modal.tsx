"use client";
 
import { tr } from "@/lib/tr";
import { useState } from "react";
import { api, toast } from "@/lib/client";
import { downloadReceiptFile, fmtCentsDisplay, fmtLocalDateTime } from "@/lib/export-render";
import type { ReceiptSnapshot } from "@/server/routes/exports";
import { Button, Modal, SelectField } from "./ui";

const PRESETS = [
  { value: "80mm", label: "80 mm (Thermal Standar)" },
  { value: "58mm", label: "58 mm (Thermal Mini)" },
  { value: "digital", label: tr("Digital (Lebar Layar / Bagikan)") },
  { value: "a4", label: tr("A4 (210 mm)") },
    { value: "a5", label: tr("A5 (148 mm)") },
  { value: "monochrome", label: tr("Monochrome (Hitam-Putih Thermal)") },
];

export function ReceiptExportModal({
  invoiceId,
  invoiceNumber,
  open,
  onClose,
}: {
  invoiceId: string | null;
  invoiceNumber?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState("80mm");
  const [format, setFormat] = useState<"pdf" | "jpg" | "png">("pdf");
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<ReceiptSnapshot | null>(null);

  async function generateAndDownload(fmt: "pdf" | "jpg" | "png") {
    if (!invoiceId) return;
    setBusy(true);
    try {
      const res = await api<{ id: string; snapshot: ReceiptSnapshot; templateConfig: Record<string, unknown> }>("/exports/receipt", {
        body: { invoiceId, format: fmt, templatePreset: preset },
      });
      setSnap(res.snapshot);
      try {
        await downloadReceiptFile(res.snapshot, fmt, preset, res.templateConfig);
      } catch (err) {
        await api(`/exports/${res.id}/fail`, { body: { error: (err as Error).message.slice(0, 250) } }).catch(() => {});
        throw err;
      }
      await api(`/exports/${res.id}/complete`, { body: {} }).catch(() => {});
      toast(`Struk ${res.snapshot.invoiceNumber} diunduh (${fmt.toUpperCase()})`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Unduh Struk ${invoiceNumber ?? ""}`} wide>
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="grid content-start gap-3">
          <SelectField label={tr("Template ukuran")} value={preset} onChange={setPreset} options={PRESETS} />
          <SelectField
            label={tr("Format berkas")}
            value={format}
            onChange={(v) => setFormat(v as "pdf" | "jpg" | "png")}
            options={[
              { value: "pdf", label: tr("PDF") },
              { value: "png", label: tr("PNG (Gambar)") },
              { value: "jpg", label: tr("JPG (Gambar)") },
            ]}
          />
          <Button loading={busy} onClick={() => void generateAndDownload(format)}>
            Unduh Struk ({format.toUpperCase()})
          </Button>
          <p className="text-xs text-ink-2">
            Struk dibuat dari snapshot transaksi yang sama dengan faktur dan jurnal. Tersedia format PDF, PNG, dan JPG.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          {!snap ? (
            <div className="grid min-h-[260px] place-items-center text-center text-sm text-ink-2">
              <p>Pilih template &amp; format, lalu klik <strong>{tr("Unduh Struk")}</strong> untuk membuat snapshot &amp; preview struk.</p>
            </div>
          ) : (
            <article aria-label={tr("Preview Struk Penjualan")} className="mx-auto max-w-[340px] rounded-2xl border border-line bg-white p-5 text-sm shadow-card">
              <div className="text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-primary-bg text-primary-deep font-bold">BF</div>
                <h3 className="mt-2 text-base font-bold text-ink">{snap.businessName}</h3>
                <p className="text-xs text-ink-2">{snap.businessAddress}</p>
                <p className="mt-1 text-xs font-semibold text-ink">{tr("Bukti Transaksi Penjualan")}</p>
              </div>
              <hr className="my-3 border-line" />
              <dl className="grid gap-1 text-xs">
                <div className="flex justify-between"><dt className="text-ink-2">{tr("No. Transaksi")}</dt><dd className="font-semibold">{snap.invoiceNumber}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">{tr("Tanggal")}</dt><dd>{fmtLocalDateTime(snap.issuedAt, snap.timezone)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">{tr("Kasir / Operator")}</dt><dd>{snap.operator}</dd></div>
              </dl>
              <hr className="my-3 border-line" />
              <div className="space-y-2">
                {snap.items.map((it, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-xs">
                    <div>
                      <p className="font-semibold text-ink">{it.name}</p>
                      <p className="text-ink-2">{it.qty} × {fmtCentsDisplay(it.unitPriceCents, snap.currency)}</p>
                    </div>
                    <p className="tnum font-semibold text-ink">{fmtCentsDisplay(it.totalCents, snap.currency)}</p>
                  </div>
                ))}
              </div>
              <hr className="my-3 border-line" />
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-ink-2"><span>{tr("Subtotal")}</span><span>{fmtCentsDisplay(snap.subtotalCents, snap.currency)}</span></div>
                {BigInt(snap.discountCents) > 0n && <div className="flex justify-between text-ink-2"><span>{tr("Diskon")}</span><span>-{fmtCentsDisplay(snap.discountCents, snap.currency)}</span></div>}
                {BigInt(snap.taxCents) > 0n && <div className="flex justify-between text-ink-2"><span>{tr("Pajak / biaya")}</span><span>{fmtCentsDisplay(snap.taxCents, snap.currency)}</span></div>}
                <div className="mt-2 flex items-center justify-between rounded-lg bg-primary-bg px-3 py-2 font-bold text-primary-deep">
                  <span>{tr("TOTAL")}</span>
                  <span className="tnum text-base">{fmtCentsDisplay(snap.totalCents, snap.currency)}</span>
                </div>
                <div className="flex justify-between pt-1"><span className="text-ink-2">{tr("Dibayar")}</span><span>{fmtCentsDisplay(snap.paidCents, snap.currency)}</span></div>
                <div className="flex justify-between font-semibold"><span>{snap.isPartialOrDue ? "Sisa" : "Kembalian"}</span><span>{fmtCentsDisplay(snap.changeOrDueCents, snap.currency)}</span></div>
              </div>
              <hr className="my-3 border-line" />
              <div className="text-center text-xs">
                <p className="font-bold text-ink">{tr("Terima kasih telah berbelanja")}</p>
                <p className="text-ink-2">{tr("Simpan bukti transaksi ini untuk referensi.")}</p>
                <p className="mt-1 font-semibold text-primary-deep">Kode verifikasi: {snap.verificationCode}</p>
              </div>
            </article>
          )}
        </div>
      </div>
    </Modal>
  );
}
