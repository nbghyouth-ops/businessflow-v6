"use client";

import { useEffect, useState } from "react";
import { api, toast, useApi } from "@/lib/client";
import { tr } from "@/lib/tr";
import { useConfirm } from "./confirm-dialog";
import { Badge, Button, Card, DataTable, SelectField, TextField } from "./ui";

/**
 * Wizard impor generik (prompt R10 §AL-1). Menggantikan kartu impor lama:
 * tidak ada pengenalan otomatis. Pengguna memilih jenis laporan, sheet, baris
 * header, dan pemetaan kolomnya sendiri; pratinjau kering menulis NOL data.
 */
type FieldDef = { key: string; label: string; help: string; type: string; required: boolean };
type ReportType = { key: string; label: string; domain: string; rowGrain: string; writable: boolean; fields: FieldDef[] };
type Catalog = {
  reportTypes: ReportType[];
  providers: { code: string; label: string; domain: string }[];
  writable: string[];
  maxRows: number;
  extensions: string[];
  note: string;
};
type SheetInfo = { name: string; hidden: boolean; rowCount: number; suggestedHeaderRow: number; preview: string[][] };
type Inspect = { format: string; encoding?: string; delimiter?: string; sheets: SheetInfo[]; warnings: string[] };
type Profile = {
  id: string; name: string; reportType: string; status: string; currentVersion: number;
  sheetName: string | null; headerRow: number; mapping: Record<string, string>; parsing: Record<string, unknown>;
};
type Preview = {
  reportType: { key: string; label: string; domain: string; rowGrain: string };
  sheetName: string; headerRow: number; headers: string[];
  mapping: { ok: boolean; missingRequired: string[]; missingBlocking: string[]; badHeaders: string[]; duplicateTargets: string[]; unmappedHeaders: string[] };
  profile: { id: string; version: number; status: string; ok: boolean; reason?: string } | null;
  writable: boolean; targetTable: string | null;
  summary: { totalRows: number; valid: number; warning: number; needsMapping: number; invalid: number; duplicates: number; potentialDuplicates: number; totalMinorByCurrency: Record<string, string> };
  rows: Array<{ rowNo: number; status: string; code?: string; masked: Record<string, string>; warnings: string[] }>;
  warnings: string[];
};

/** Ambang baris: di atas ini pekerjaan dijalankan sebagai job langkah-kecil (server). */
const LARGE_FILE_ROWS = 2_000;

type JobProgress = {
  id: string;
  kind: "PREVIEW" | "COMMIT";
  state: "QUEUED" | "RUNNING" | "PAUSED" | "DONE" | "FAILED" | "CANCELED";
  total: number;
  processed: number;
  percent: number;
  busy?: boolean;
  error: { code: string } | null;
  result: unknown;
};

const JOB_TERMINAL = new Set(["DONE", "FAILED", "CANCELED"]);

/** Id job yang belum selesai; dipakai menawarkan "Lanjutkan" setelah tab dibuka lagi. */
const JOB_STORAGE_KEY = "bf.import.job";

const STEPS = [
  "Domain & provider",
  "Jenis laporan",
  "Toko / rekening",
  "Unggah berkas",
  "Sheet & baris header",
  "Pemetaan kolom",
  "Opsi parsing",
  "Pratinjau & commit",
];

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function ImportRecording({ canWrite }: { canWrite: boolean }) {
  const catalog = useApi<Catalog>("/v6/imports/recording/catalog");
  const profileList = useApi<{ items: Profile[] }>("/v6/imports/recording/profiles");
  const aliasList = useApi<{ items: Array<{ id: string; label: string; bankLabel: string | null; last4: string | null }> }>("/v6/bank/aliases");
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("marketplace");
  const [provider, setProvider] = useState("");
  const [reportType, setReportType] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [fileName, setFileName] = useState("");
  const [base64, setBase64] = useState("");
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [decimalHint, setDecimalHint] = useState("auto");
  const [dateFormat, setDateFormat] = useState("auto");
  const [timeZone, setTimeZone] = useState("Asia/Jakarta");
  const [currency, setCurrency] = useState("IDR");
  const [amountRule, setAmountRule] = useState("unspecified");
  const [bankAliasId, setBankAliasId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [job, setJob] = useState<JobProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [pendingJob, setPendingJob] = useState<string | null>(null);
  const { confirm, ConfirmUI } = useConfirm();

  const reports = catalog.data?.reportTypes ?? [];
  const providers = (catalog.data?.providers ?? []).filter((p) => p.domain === domain || p.code.startsWith("other"));
  const report = reports.find((r) => r.key === reportType);
  const sheets = inspect?.sheets ?? [];
  const currentSheet = sheets.find((s) => s.name === sheetName);
  const headerPreview = currentSheet?.preview[headerRow] ?? [];
  const profileOptions = (profileList.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.name} (v${p.currentVersion} · ${p.status})` }));
  const aliasOptions = (aliasList.data?.items ?? []).map((a) => ({ value: a.id, label: `${a.label}${a.bankLabel ? ` · ${a.bankLabel}` : ""}${a.last4 ? ` · ••••${a.last4}` : ""}` }));
  const missingFields = (report?.fields ?? []).filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  const mappingIssueCount = missingFields.length;
  const parsing = { decimalHint, dateFormat, sourceTimeZone: timeZone, currencyCode: currency, amountRule } as Record<string, string>;

  function resetFromUpload() {
    setPreview(null); setResult("");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    resetFromUpload();
    setFileName(file.name);
    setBusy(true);
    try {
      const b64 = await fileToBase64(file);
      setBase64(b64);
      const res = await api<Inspect>("/v6/imports/recording/inspect", { body: { filename: file.name, base64: b64 } });
      setInspect(res);
      const first = res.sheets[0];
      if (first) { setSheetName(first.name); setHeaderRow(first.suggestedHeaderRow); }
      setStep(4);
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function loadProfile(id: string) {
    setProfileId(id);
    const profiles = (await api<{ items: Profile[] }>("/v6/imports/recording/profiles")).items;
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setReportType(p.reportType);
    setMapping({ ...p.mapping });
    setProfileName(p.name);
    toast(tr("Profil dimuat — periksa pemetaan sebelum melanjutkan."), "ok");
  }

  const recordingBody = () => ({
    reportType, providerCode: provider || undefined, providerLabel: provider || undefined,
    sourceLabel: sourceLabel || undefined, filename: fileName, sheetName, headerRow, mapping, parsing,
    base64, bankAliasId: bankAliasId || undefined, profileId: profileId || undefined,
  });

  /**
   * Berkas besar: pekerjaan berjalan sebagai job server, dan UI-lah yang memajukannya
   * lewat `advance` (mode serverless-aman, R16 §2.1). Setiap panggilan memproses potongan
   * berikutnya ≤6 dtk, jadi job selesai hanya dengan permintaan HTTP biasa — tanpa loop
   * latar yang harus hidup di produksi.
   */
  async function runJob(kind: "PREVIEW" | "COMMIT", existingId?: string): Promise<JobProgress> {
    let current: JobProgress;
    let id: string;
    if (existingId) {
      id = existingId;
      current = (job && job.id === existingId) ? job : await api<JobProgress>(`/v6/imports/recording/jobs/${existingId}`);
      setJob(current);
    } else {
      current = await api<JobProgress>("/v6/imports/recording/jobs", { body: { ...recordingBody(), kind } });
      id = current.id;
      setJob(current);
      try { window.localStorage.setItem(JOB_STORAGE_KEY, id); } catch { /* mode privat: abaikan */ }
    }
    for (let i = 0; i < 900; i += 1) {
      try {
        current = await api<JobProgress>(`/v6/imports/recording/jobs/${id}/advance`, { method: "POST", body: {} });
      } catch {
        // Galat sesaat (jaringan/5xx): job tetap ada di server. Mundur sebentar, lalu lanjut.
        await new Promise((r) => setTimeout(r, 800));
        current = await api<JobProgress>(`/v6/imports/recording/jobs/${id}`);
      }
      setJob(current);
      if (JOB_TERMINAL.has(current.state)) {
        try { window.localStorage.removeItem(JOB_STORAGE_KEY); } catch { /* abaikan */ }
        return current;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error(tr("Job impor melebihi waktu tunggu."));
  }

  // Tab dibuka lagi setelah ditutup di tengah job: tawarkan melanjutkan dari cursor terakhir.
  // Dibaca di luar render sinkron (setTimeout 0) supaya render pertama tetap sama dengan server.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(JOB_STORAGE_KEY);
    } catch { /* mode privat: abaikan */ }
    if (!saved) return;
    const timer = window.setTimeout(() => setPendingJob(saved), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function resumePendingJob() {
    if (!pendingJob) return;
    setBusy(true);
    try {
      const known = await api<JobProgress>(`/v6/imports/recording/jobs/${pendingJob}`);
      setJob(known);
      if (JOB_TERMINAL.has(known.state)) {
        setPendingJob(null);
        return;
      }
      const done = await runJob(known.kind, pendingJob);
      setPendingJob(null);
      if (done.state !== "DONE") throw new Error(tr("Job impor dibatalkan atau gagal."));
      if (known.kind === "PREVIEW") {
        setPreview(done.result as Preview);
        setStep(7);
      } else {
        const r = done.result as { inserted: number; duplicates: number; invalid: number } | null;
        if (!r) throw new Error(tr("Pencatatan dibatalkan atau gagal. Tidak ada baris yang diterbitkan."));
        setResult(tr("Hasil: {n} baris dicatat, {d} baris duplikat, {i} baris dilewati.").replace("{n}", String(r.inserted)).replace("{d}", String(r.duplicates)).replace("{i}", String(r.invalid)));
        setPreview(null);
        setStep(0);
      }
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setJob(null);
      setBusy(false);
    }
  }

  async function cancelRunningJob() {
    if (!job) return;
    try {
      setJob(await api<JobProgress>(`/v6/imports/recording/jobs/${job.id}/cancel`, { method: "POST", body: {} }));
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  async function runPreview() {
    setBusy(true); setResult("");
    try {
      if ((currentSheet?.rowCount ?? 0) > LARGE_FILE_ROWS) {
        const p = await runJob("PREVIEW");
        if (p.state !== "DONE") throw new Error(tr("Pratinjau dibatalkan atau gagal. Periksa berkas lalu coba lagi."));
        setPreview(p.result as Preview);
      } else {
        const res = await api<Preview>("/v6/imports/recording/preview", { body: recordingBody() });
        setPreview(res);
      }
      setStep(7);
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setJob(null);
      setBusy(false);
    }
  }

  async function runCommit() {
    const ok = await confirm({
      title: tr("Konfirmasi impor"),
      message: tr("Data akan dicatat dari berkas ini. Tindakan ini tidak menghubungi marketplace/bank mana pun."),
      confirmLabel: tr("Catat sekarang"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = (currentSheet?.rowCount ?? 0) > LARGE_FILE_ROWS
        ? (await runJob("COMMIT")).result as { inserted: number; duplicates: number; invalid: number } | null
        : await api<{ inserted: number; duplicates: number; invalid: number }>("/v6/imports/recording/commit", { body: recordingBody() });
      if (!res) throw new Error(tr("Pencatatan dibatalkan atau gagal. Tidak ada baris yang diterbitkan."));
      setResult(tr("Hasil: {n} baris dicatat, {d} baris duplikat, {i} baris dilewati.").replace("{n}", String(res.inserted)).replace("{d}", String(res.duplicates)).replace("{i}", String(res.invalid)));
      setPreview(null);
      setStep(0);
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setJob(null);
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!profileName.trim()) return toast(tr("Beri nama profil pemetaan lebih dulu."), "err");
    setBusy(true);
    try {
      const res = await api<{ id: string; version: number }>("/v6/imports/recording/profiles", {
        body: { name: profileName.trim(), reportType, providerCode: provider || undefined, sourceLabel: sourceLabel || undefined, fileFormat: inspect?.format ?? "any", snapshot: { sheetName: sheetName || null, headerRow, mapping, parsing } },
      });
      setProfileId(res.id);
      toast(tr("Profil pemetaan tersimpan — dikonfirmasi untuk workspace ini."), "ok");
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  // Alias rekening WAJIB dipilih untuk domain bank (mutasi tanpa rekening tidak dapat direkonsiliasi).
  const needsAlias = domain === "bank";
  const canNext = step === 0 ? Boolean(provider)
    : step === 1 ? Boolean(reportType)
    : step === 2 ? (!needsAlias || Boolean(bankAliasId))
    : step === 3 ? Boolean(inspect)
    : true;

  return (
    <Card
      title={tr("Impor data marketplace")}
      desc={tr("Berkas diunggah dari perangkat Anda dan hanya dicatat sebagai fakta: aplikasi tidak tersambung ke marketplace atau bank.")}
    >
      {ConfirmUI}
      <ol className="flex flex-wrap gap-2 text-xs" aria-label={tr("Langkah impor")}>
        {STEPS.map((label, i) => (
          <li key={label} data-step={i}>
            <Badge tone={i === step ? "good" : i < step ? "info" : "neutral"}>{`${i + 1}. ${tr(label)}`}</Badge>
          </li>
        ))}
      </ol>

      {pendingJob && !busy && (
        <div className="mt-3 grid gap-2 rounded-xl border border-[var(--color-line)] p-3" role="status">
          <p className="text-sm">{tr("Ada job impor yang belum selesai. Lanjutkan dari posisi terakhir?")}</p>
          <div className="flex gap-2">
            <Button onClick={() => void resumePendingJob()}>{tr("Lanjutkan")}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingJob(null);
                try { window.localStorage.removeItem(JOB_STORAGE_KEY); } catch { /* abaikan */ }
              }}
            >
              {tr("Abaikan")}
            </Button>
          </div>
        </div>
      )}

      {job && !JOB_TERMINAL.has(job.state) && (
        <div className="mt-3 grid gap-2 rounded-xl border border-[var(--color-line)] p-3" role="status" aria-live="polite">
          <p className="text-sm">
            {tr("Memproses berkas sebagai job langkah-kecil:")} <strong>{job.processed}</strong>
            {job.total > 0 ? ` / ${job.total}` : ""} {tr("baris")} · {job.percent}%
          </p>
          <div
            role="progressbar"
            aria-label={tr("Progres impor")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.percent}
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-4)]"
          >
            <div className="h-full bg-[var(--color-accent)]" style={{ width: `${job.percent}%` }} />
          </div>
          <p className="text-xs text-ink-2">
            {job.state === "PAUSED"
              ? tr("Job dijeda sementara: lanjutkan kapan saja dari posisi terakhir.")
              : tr("Job berjalan di server: halaman boleh ditutup dan progres tetap tersimpan.")}
          </p>
          <div>
            <Button variant="ghost" onClick={() => void cancelRunningJob()}>{tr("Batal")}</Button>
          </div>
        </div>
      )}

      {step === 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label={tr("Domain *")}
            value={domain}
            onChange={(v) => { setDomain(v); setProvider(""); setReportType(""); }}
            options={[{ value: "marketplace", label: tr("Marketplace") }, { value: "bank", label: tr("Bank") }]}
          />
          <SelectField
            label={tr("Provider (konteks sumber) *")}
            value={provider}
            onChange={setProvider}
            options={providers.map((p) => ({ value: p.code, label: p.label }))}
            placeholder={tr("Pilih dari mana berkas berasal")}
          />
          <p className="text-xs text-ink-2 sm:col-span-2">{tr(catalog.data?.note ?? "")}</p>
        </div>
      )}

      {step === 1 && (
        <div className="mt-3 grid gap-2">
          <SelectField
            label={tr("Jenis laporan & row grain *")}
            value={reportType}
            onChange={(v) => { setReportType(v); setMapping({}); setPreview(null); }}
            options={reports.filter((r) => r.domain === domain).map((r) => ({ value: r.key, label: `${r.label} — ${r.rowGrain}${r.writable ? "" : tr(" (pratinjau saja)")}` }))}
            placeholder={tr("Pilih jenis laporan")}
          />
          {report && <p className="text-xs text-ink-2">{tr("Satu dataset tidak boleh mencampur row grain. Jenis ini:")} {report.rowGrain}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {domain === "bank" ? (
            <SelectField
              label={tr("Alias rekening terdaftar *")}
              value={bankAliasId}
              onChange={setBankAliasId}
              options={aliasOptions}
              placeholder={tr("Pilih rekening tujuan pencatatan")}
            />
          ) : (
            <TextField
              label={tr("Toko / label sumber")}
              value={sourceLabel}
              onChange={setSourceLabel}
              help={tr("Label saja — aplikasi tidak menyimpan kredensial marketplace/bank.")}
            />
          )}
          <SelectField
            label={tr("Profil pemetaan tersimpan (opsional)")}
            value={profileId}
            onChange={(v) => (v ? void loadProfile(v) : setProfileId(""))}
            options={profileOptions}
            placeholder={tr("Belum ada profil dipilih")}
          />
          {domain === "bank" && (
            aliasOptions.length === 0 ? (
              <p className="rounded-xl bg-[var(--color-warn-bg)] px-3 py-2 text-xs text-[var(--color-warn-ink)] sm:col-span-2">
                {tr("Belum ada alias rekening. Tambahkan lebih dulu di halaman Bank & Rekonsiliasi agar mutasi dapat direkonsiliasi.")}
              </p>
            ) : (
              <p className="text-xs text-ink-2 sm:col-span-2">
                {tr("Alias rekening menyimpan label dan maksimal 4 digit terakhir — bukan nomor rekening penuh.")}
              </p>
            )
          )}
        </div>
      )}

      {step === 3 && (
        <div className="mt-3 grid gap-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{tr("Berkas CSV/XLSX *")}</span>
            <input type="file" data-testid="import-file" accept={(catalog.data?.extensions ?? [".csv"]).join(",")} className="field-input" onChange={(e) => void onFile(e)} disabled={!canWrite} />
          </label>
          <p className="text-xs text-ink-2">{tr("Batas ukuran 32 MB dan {n} baris per berkas.").replace("{n}", String(catalog.data?.maxRows ?? 50000))}</p>
          {inspect && <p className="text-xs text-ink-2">{tr("Format:")} <strong>{inspect.format}</strong>{inspect.delimiter ? ` · ${tr("pemisah")} "${inspect.delimiter === "\t" ? "TAB" : inspect.delimiter}"` : ""}{inspect.encoding ? ` · ${inspect.encoding}` : ""}</p>}
        </div>
      )}

      {step === 4 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label={tr("Sheet *")}
            value={sheetName}
            onChange={(v) => { setSheetName(v); const s = sheets.find((x) => x.name === v); setHeaderRow(s?.suggestedHeaderRow ?? 0); setPreview(null); }}
            options={sheets.map((s) => ({ value: s.name, label: `${s.name}${s.hidden ? tr(" (tersembunyi)") : ""} · ${s.rowCount} ${tr("baris")}` }))}
          />
          <SelectField
            label={tr("Baris header *")}
            value={String(headerRow)}
            onChange={(v) => { setHeaderRow(Number(v)); setPreview(null); }}
            options={(currentSheet?.preview ?? []).map((row, i) => ({ value: String(i), label: `${tr("Baris")} ${i + 1}: ${row.filter(Boolean).slice(0, 5).join(" | ") || "(kosong)"}` }))}
          />
          <div className="sm:col-span-2 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <caption className="p-2 text-left text-ink-2">{tr("Pratinjau baris awal berkas")}</caption>
              <tbody>
                {(currentSheet?.preview ?? []).map((row, i) => (
                  <tr key={i} className={i === headerRow ? "bg-[var(--color-primary-bg)] font-semibold" : ""}>
                    <td className="px-2 py-1 text-ink-2">{i + 1}</td>
                    {row.slice(0, 6).map((c, j) => <td key={j} className="max-w-[12rem] truncate px-2 py-1" title={c}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-ink-2">
            {tr("Header terdeteksi:")} {headerPreview.filter(Boolean).map((h, i) => <span key={i} className="mr-2 rounded bg-surface px-1.5 py-0.5">{h}</span>)}
          </p>
          <div className="grid gap-2">
            {(report?.fields ?? []).map((f) => (
              <div key={f.key} className="grid gap-0.5">
                <SelectField
                  label={`${f.label}${f.required ? " *" : ""}`}
                  value={mapping[f.key] ?? ""}
                  onChange={(v) => { setMapping((m) => ({ ...m, [f.key]: v })); setPreview(null); }}
                  options={[{ value: "", label: tr("— tidak dipetakan —") }, ...headerPreview.filter(Boolean).map((h) => ({ value: h, label: h }))]}
                />
                <p className="text-xs text-ink-2">{f.help}</p>
              </div>
            ))}
          </div>
          {mappingIssueCount > 0 && (
            <p className="rounded-xl bg-[var(--color-warn-bg)] px-3 py-2 text-xs text-[var(--color-warn-ink)]">
              {tr("Kolom wajib belum dipetakan: {list}").replace("{list}", missingFields.join(", "))}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField label={tr("Simpan sebagai profil (nama)")} value={profileName} onChange={setProfileName} help={tr("Menyimpan profil TIDAK mengonfirmasi batch berikutnya.")} />
            <div className="flex items-end"><Button variant="secondary" loading={busy} disabled={!canWrite || !profileName.trim()} onClick={() => void saveProfile()}>{tr("Simpan profil pemetaan")}</Button></div>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField label={tr("Pemisah desimal/ribuan")} value={decimalHint} onChange={setDecimalHint} options={[{ value: "auto", label: tr("Otomatis (periksa hasil)") }, { value: "comma", label: tr("1.234,56") }, { value: "dot", label: tr("1,234.56") }]} />
          <SelectField label={tr("Format tanggal")} value={dateFormat} onChange={setDateFormat} options={[{ value: "auto", label: tr("Otomatis") }, { value: "dmy", label: "DD/MM/YYYY" }, { value: "mdy", label: "MM/DD/YYYY" }]} />
          <TextField label={tr("Zona waktu sumber")} value={timeZone} onChange={setTimeZone} help={tr("Hanya diubah bila sumber menyatakannya (mis. UTC).")} />
          <TextField label={tr("Mata uang")} value={currency} onChange={setCurrency} help={tr("Dipakai bila berkas tidak memuat kolom mata uang.")} />
          {report?.domain === "bank" && (
            <SelectField
              label={tr("Arah nominal bank *")}
              value={amountRule}
              onChange={setAmountRule}
              options={[{ value: "unspecified", label: tr("— belum dipilih —") }, { value: "debit_credit", label: tr("Kolom debit & kredit terpisah") }, { value: "signed", label: tr("Satu kolom bertanda") }]}
            />
          )}
          <p className="text-xs text-ink-2 sm:col-span-2">{tr("Nilai ini yang dipakai perhitungan: aplikasi tidak menebak locale, zona waktu, atau mata uang.")}</p>
        </div>
      )}

      {step === 7 && preview && (
        <div className="mt-3 grid gap-3">
          <p className="rounded-xl bg-[var(--color-warn-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-warn-ink)]">
            {tr("Simulasi — belum ada transaksi atau jurnal produksi yang ditulis.")}
          </p>
          <div className="grid gap-2 text-sm sm:grid-cols-5">
            <span>{tr("Baris:")} <strong>{preview.summary.totalRows}</strong></span>
            <span>{tr("Siap dicatat:")} <strong>{preview.summary.valid}</strong></span>
            <span>{tr("Peringatan:")} <strong>{preview.summary.warning}</strong></span>
            <span>{tr("Duplikat:")} <strong>{preview.summary.duplicates}</strong></span>
            <span>{tr("Dilewati:")} <strong>{preview.summary.invalid + preview.summary.needsMapping}</strong></span>
          </div>
          <p className="text-xs text-ink-2">
            {preview.profile ? `${tr("Profil:")} v${preview.profile.version} · ${preview.profile.status}` : tr("Tanpa profil tersimpan")} · {tr("Pemetaan:")} {preview.mapping.ok ? tr("lengkap") : tr("belum lengkap")}
          </p>
          {Object.keys(preview.summary.totalMinorByCurrency).length > 0 && (
            <p className="text-xs text-ink-2">{tr("Total per mata uang (unit minor, tidak dijumlahkan lintas mata uang):")} {Object.entries(preview.summary.totalMinorByCurrency).map(([c, v]) => `${c} ${v}`).join(" · ")}</p>
          )}
          <DataTable
            rows={preview.rows}
            caption={tr("Contoh baris hasil pratinjau")}
            empty={<p className="p-3 text-sm text-ink-2">{tr("Tidak ada baris.")}</p>}
            columns={[
              { key: "rowNo", label: tr("Baris"), right: true },
              { key: "status", label: tr("Status"), render: (r: any) => <Badge tone={r.status === "VALID" ? "good" : r.status === "DUPLICATE" || r.status === "INVALID" ? "bad" : "warn"}>{r.status}</Badge> },
              { key: "code", label: tr("Kode"), render: (r: any) => r.code ?? "—" },
              { key: "warnings", label: tr("Catatan"), render: (r: any) => (r.warnings.length ? r.warnings.join("; ") : "—") },
            ]}
          />
          {preview.warnings.length > 0 && <p className="text-xs text-ink-2">{preview.warnings.join(" · ")}</p>}
          {!preview.writable && <p className="text-xs text-ink-2">{tr("Jenis laporan ini baru bisa dipratinjau; tabel tujuannya belum tersedia pada putaran ini.")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy} onClick={() => void runPreview()}>{tr("Perbarui pratinjau")}</Button>
            <Button loading={busy} disabled={!canWrite || !preview.writable || !preview.mapping.ok || preview.summary.valid + preview.summary.warning === 0} onClick={() => void runCommit()}>{tr("Catat sekarang")}</Button>
            <Button variant="ghost" onClick={() => setStep(6)}>{tr("Ubah opsi parsing")}</Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(0, s - 1))}>{tr("Kembali")}</Button>
        {step < 6 && (
          <Button disabled={!canNext || busy} onClick={() => setStep((s) => Math.min(6, s + 1))}>{tr("Lanjut")}</Button>
        )}
        {step === 6 && (
          <Button loading={busy} disabled={!canWrite || !fileName} onClick={() => void runPreview()}>{tr("Pratinjau kering")}</Button>
        )}
        {!canWrite && <span className="self-center text-xs text-ink-2">{tr("Impor memerlukan izin impor tulis (Owner).")}</span>}
      </div>

      {result && <p role="status" className="mt-3 rounded-xl bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success-text)]">{result}</p>}
    </Card>
  );
}
