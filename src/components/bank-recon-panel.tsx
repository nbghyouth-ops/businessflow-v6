"use client";

import { useState } from "react";
import { tr } from "@/lib/tr";
import { api, fmtDate, toast, useApi } from "@/lib/client";
import { fromCents, formatMoney } from "@/lib/money";
import { useBiz } from "./shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Tabs, TextField } from "./ui";

const err = (e: unknown) => toast((e as Error).message, "err");

/**
 * Layar Bank & Rekonsiliasi (R11-B/T3). Hanya MENCATAT fakta: alias rekening,
 * mutasi hasil impor, klasifikasi yang dikonfirmasi pengguna, dan pencocokan
 * yang juga harus dikonfirmasi pengguna. Tidak ada transfer/pembayaran.
 */
export const BANK_CLASS_OPTIONS = [
  { value: "marketplace_payout", labelKey: "Pencairan marketplace (tercatat)" },
  { value: "other_income", labelKey: "Penerimaan lain" },
  { value: "bank_fee", labelKey: "Biaya bank" },
  { value: "supplier_payment_recorded", labelKey: "Bayar supplier (tercatat)" },
  { value: "expense", labelKey: "Beban" },
  { value: "transfer_out", labelKey: "Transfer keluar (tercatat)" },
  { value: "own_account_transfer", labelKey: "Perpindahan antar-rekening sendiri" },
  { value: "other", labelKey: "Lain" },
  { value: "unknown", labelKey: "Belum diketahui" },
];

function Money({ v }: { v: string | null | undefined }) {
  const biz = useBiz();
  if (v === null || v === undefined) return <span className="text-ink-2">—</span>;
  return <span className="tnum">{formatMoney(fromCents(BigInt(v)), biz.currency)}</span>;
}

export function BankReconPanel() {
  const biz = useBiz();
  const [tab, setTab] = useState("lines");
  const aliases = useApi<any>("/v6/bank/aliases");
  const lines = useApi<any>(tab === "lines" ? "/v6/bank/lines?limit=200" : null);
  const candidates = useApi<any>(tab === "recon" ? "/v6/reconciliation/candidates" : null);
  const matches = useApi<any>(tab === "recon" ? "/v6/reconciliation/matches" : null);
  const [form, setForm] = useState({ label: "", bankLabel: "", accountLast4: "" });
  const [busy, setBusy] = useState(false);
  const canWrite = biz.can("import:write");

  const reload = () => { aliases.reload(); lines.reload(); candidates.reload(); matches.reload(); };

  async function submitAlias() {
    setBusy(true);
    try {
      await api("/v6/bank/aliases", {
        body: { label: form.label, bankLabel: form.bankLabel || null, accountLast4: form.accountLast4 || null },
      });
      toast(tr("Alias tersimpan"));
      setForm({ label: "", bankLabel: "", accountLast4: "" });
      reload();
    } catch (e) { err(e); } finally { setBusy(false); }
  }

  async function classify(lineId: string, classification: string) {
    try {
      await api(`/v6/bank/lines/${lineId}/classify`, { body: { classification } });
      toast(tr("Klasifikasi disimpan"));
      reload();
    } catch (e) { err(e); }
  }

  async function confirmMatch(c: any) {
    try {
      await api("/v6/reconciliation/matches", {
        body: {
          leftKind: c.leftKind, leftId: c.leftId, rightId: c.bankLineId,
          reason: c.ref ? tr("Rujukan sumber muncul di keterangan bank") : tr("Nominal eksak dan tanggal berdekatan"),
        },
      });
      toast(tr("Pencocokan tersimpan"));
      reload();
    } catch (e) { err(e); }
  }

  async function releaseMatch(id: string) {
    try {
      await api(`/v6/reconciliation/matches/${id}`, { method: "DELETE" });
      toast(tr("Pencocokan dilepas"));
      reload();
    } catch (e) { err(e); }
  }

  return (
    <>
      <Tabs
        tabs={[
          { key: "lines", label: tr("Mutasi bank") },
          { key: "recon", label: tr("Rekonsiliasi") },
          { key: "aliases", label: tr("Alias rekening") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "lines" && (
        lines.error ? <ErrorBox message={lines.error} onRetry={lines.reload} /> : lines.loading && !lines.data ? <Loading /> : (
          <Card>
            <DataTable
              rows={lines.data?.items ?? []}
              caption={tr("Mutasi bank hasil impor")}
              empty={<Empty title={tr("Belum ada mutasi bank")} hint={tr("Impor mutasi bank lewat Pusat Import, lalu klasifikasikan barisnya di sini.")} />}
              columns={[
                { key: "postedOn", label: tr("Tanggal"), render: (r: any) => (r.postedOn ? fmtDate(r.postedOn) : tr("Belum diketahui")) },
                { key: "aliasLabel", label: tr("Rekening"), render: (r: any) => r.aliasLabel ?? "—" },
                { key: "description", label: tr("Keterangan") },
                { key: "amount", label: tr("Jumlah"), right: true, render: (r: any) => <Money v={r.amount} /> },
                { key: "direction", label: tr("Arah"), render: (r: any) => (r.direction === "debit" ? tr("Keluar") : tr("Masuk")) },
                {
                  key: "class",
                  label: tr("Klasifikasi"),
                  render: (r: any) => (r.confirmedClass
                    ? <Badge status="paid">{tr(BANK_CLASS_OPTIONS.find((o) => o.value === r.confirmedClass)?.labelKey ?? r.confirmedClass)}</Badge>
                    : canWrite
                      ? (
                        <select
                          aria-label={tr("Klasifikasi")}
                          className="rounded-lg border border-line bg-white px-2 py-1 text-sm"
                          value=""
                          onChange={(e) => { if (e.target.value) void classify(r.id, e.target.value); }}
                        >
                          <option value="">{tr("Belum diklasifikasi")}</option>
                          {BANK_CLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{tr(o.labelKey)}</option>)}
                        </select>
                      )
                      : <span className="text-ink-2">{tr("Belum diklasifikasi")}</span>),
                },
              ]}
            />
          </Card>
        )
      )}

      {tab === "recon" && (
        <div className="grid gap-4">
          <Card>
            {candidates.error ? <ErrorBox message={candidates.error} onRetry={candidates.reload} /> : candidates.loading && !candidates.data ? <Loading /> : (
              <DataTable
                rows={candidates.data?.items ?? []}
                caption={tr("Kandidat pencocokan")}
                empty={<Empty title={tr("Belum ada kandidat")} hint={tr("Kandidat memakai nominal eksak, kedekatan tanggal, dan rujukan pada keterangan bank. Keputusan akhir tetap milik Anda.")} />}
                columns={[
                  { key: "leftKind", label: tr("Sisi settlement"), render: (r: any) => r.leftKind === "settlement_summary" ? tr("Ringkasan settlement") : tr("Referensi pembayaran") },
                  { key: "ref", label: tr("Rujukan"), render: (r: any) => r.ref || "—" },
                  { key: "leftDate", label: tr("Tanggal"), render: (r: any) => (r.leftDate ? fmtDate(r.leftDate) : "—") },
                  { key: "leftAmount", label: tr("Jumlah"), right: true, render: (r: any) => <Money v={r.leftAmount} /> },
                  { key: "bankAmount", label: tr("Mutasi bank"), right: true, render: (r: any) => <Money v={r.bankAmount} /> },
                  { key: "score", label: tr("Skor"), right: true },
                  { key: "act", label: "", render: (r: any) => (canWrite ? <Button variant="secondary" onClick={() => void confirmMatch(r)}>{tr("Konfirmasi")}</Button> : null) },
                ]}
              />
            )}
          </Card>
          <Card>
            {matches.error ? <ErrorBox message={matches.error} onRetry={matches.reload} /> : matches.loading && !matches.data ? <Loading /> : (
              <DataTable
                rows={(matches.data?.items ?? []).filter((m: any) => !m.unmatched)}
                caption={tr("Pencocokan tersimpan")}
                empty={<Empty title={tr("Belum ada pencocokan tersimpan")} hint={tr("Pencocokan hanya tersimpan setelah Anda mengonfirmasi kandidat.")} />}
                columns={[
                  { key: "leftKind", label: tr("Sisi settlement"), render: (r: any) => r.leftKind === "settlement_summary" ? tr("Ringkasan settlement") : tr("Referensi pembayaran") },
                  { key: "status", label: tr("Status") },
                  { key: "matchedAmount", label: tr("Jumlah cocok"), right: true, render: (r: any) => <Money v={r.matchedAmount} /> },
                  { key: "difference", label: tr("Selisih"), right: true, render: (r: any) => <Money v={r.difference} /> },
                  { key: "act", label: "", render: (r: any) => (canWrite ? <Button variant="ghost" onClick={() => void releaseMatch(r.id)}>{tr("Lepas")}</Button> : null) },
                ]}
              />
            )}
          </Card>
        </div>
      )}

      {tab === "aliases" && (
        <div className="grid gap-4">
          <Card>
            {aliases.error ? <ErrorBox message={aliases.error} onRetry={aliases.reload} /> : aliases.loading && !aliases.data ? <Loading /> : (
              <DataTable
                rows={aliases.data?.items ?? []}
                caption={tr("Alias rekening")}
                empty={<Empty title={tr("Belum ada alias rekening")} hint={tr("Alias menandai rekening tanpa menyimpan nomor penuh.")} />}
                columns={[
                  { key: "label", label: tr("Label") },
                  { key: "bankLabel", label: tr("Bank"), render: (r: any) => r.bankLabel ?? "—" },
                  { key: "last4", label: tr("4 digit terakhir"), render: (r: any) => (r.last4 ? `••••${r.last4}` : "—") },
                  { key: "lineCount", label: tr("Baris mutasi"), right: true },
                ]}
              />
            )}
          </Card>
          {canWrite && (
            <Card>
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField label={tr("Label alias *")} value={form.label} onChange={(v) => setForm((s) => ({ ...s, label: v }))} />
                <TextField label={tr("Bank (opsional)")} value={form.bankLabel} onChange={(v) => setForm((s) => ({ ...s, bankLabel: v }))} />
                <TextField label={tr("4 digit terakhir")} value={form.accountLast4} onChange={(v) => setForm((s) => ({ ...s, accountLast4: v.replace(/[^0-9]/g, "").slice(0, 4) }))} />
              </div>
              <div className="mt-3 flex justify-end"><Button loading={busy} disabled={!form.label.trim()} onClick={() => void submitAlias()}>{tr("Tambah alias")}</Button></div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
