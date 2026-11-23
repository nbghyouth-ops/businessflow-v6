"use client";

import { tr } from "@/lib/tr";
import { useMemo, useState } from "react";
import { useBiz } from "@/components/shell";
import { Button, Card, PageHeader, SelectField } from "@/components/ui";
import { api, toast, useApi } from "@/lib/client";

/** Zona waktu yang lazim dipakai bisnis Indonesia + beberapa acuan. */
const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Europe/London",
  "UTC",
  "America/New_York",
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: tr("DD/MM/YYYY (31/12/2026)") },
  { value: "MM/DD/YYYY", label: tr("MM/DD/YYYY (12/31/2026)") },
  { value: "YYYY-MM-DD", label: tr("YYYY-MM-DD (2026-12-31)") },
];

const LOCALE: Record<string, string> = { id: "id-ID", en: "en-US" };

export default function LanguageSettingsPage() {
  const biz = useBiz();
  const b = biz.business;
  const me = useApi<{ user: { locale?: string | null } }>("/account/me");
  // Prioritas: preferensi pengguna → bahasa workspace → id. Tanpa efek samping render.
  const pref = me.data?.user?.locale;
  const [override, setOverride] = useState<"id" | "en" | null>(null);
  const language: "id" | "en" = override ?? (pref === "id" || pref === "en" ? pref : b.language === "en" ? "en" : "id");
  const setLanguage = (v: "id" | "en") => setOverride(v);
  const [timezone, setTimezone] = useState<string>(b.timezone || "Asia/Jakarta");
  const [dateFormat, setDateFormat] = useState<string>(b.dateFormat || "DD/MM/YYYY");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const locale = LOCALE[language] ?? "id-ID";
  const sampleDate = useMemo(() => new Date("2026-11-19T10:30:00Z"), []);

  const preview = useMemo(() => {
    const safe = (fn: () => string, fallback: string) => {
      try {
        return fn();
      } catch {
        return fallback;
      }
    };
    const date = safe(
      () => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: timezone }).format(sampleDate),
      "—",
    );
    const time = safe(
      () => new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: timezone }).format(sampleDate),
      "—",
    );
    const number = safe(() => new Intl.NumberFormat(locale).format(1234567.89), "—");
    const money = safe(
      () =>
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency: b.currency || "IDR",
          maximumFractionDigits: b.currency === "IDR" ? 0 : 2,
        }).format(1234567.89),
      "—",
    );
    return { date, time, number, money };
  }, [locale, timezone, b.currency, sampleDate]);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await api("/account/preferences", { method: "PATCH", body: { locale: language } });
      await api("/v6/preferences", { method: "PATCH", body: { language } });
      await api("/business", { method: "PATCH", body: { timezone, dateFormat } });
      toast(tr("Bahasa & regional disimpan"));
      biz.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        label={tr("Pengaturan")}
        title={tr("Bahasa & Regional")}
        desc={tr("Bahasa antarmuka tidak mengubah mata uang maupun zona waktu. Mata uang workspace dan zona waktu tetap seperti yang Anda tetapkan.")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={tr("Bahasa antarmuka")} desc={tr("Pilih bahasa tampilan. Pilihan disimpan pada akun dan dipakai lintas perangkat.")}>
          <div role="group" aria-label={tr("Bahasa antarmuka")} className="flex gap-2">
            {(["id", "en"] as const).map((code) => (
              <Button
                key={code}
                variant={language === code ? "primary" : "secondary"}
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {code === "id" ? "ID — Indonesia" : "EN — English"}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-secondary">
            Pilihan ini tersimpan pada akun (lintas perangkat). Bila belum dipilih, urutannya: bahasa workspace, lalu bahasa peramban, lalu Indonesia.
          </p>
        </Card>

        <Card title={tr("Zona waktu & format")} desc={tr("Dipakai untuk menentukan tanggal transaksi dan rentang laporan.")}>
          <div className="grid gap-3">
            <SelectField
              label={tr("Zona waktu")}
              value={timezone}
              onChange={(v) => setTimezone(v)}
              options={Array.from(new Set([timezone, ...TIMEZONES])).map((tz) => ({ value: tz, label: tz }))}
            />
            <SelectField
              label={tr("Format tanggal")}
              value={dateFormat}
              onChange={(v) => setDateFormat(v)}
              options={DATE_FORMATS}
            />
            <p className="text-xs text-secondary">
              Mata uang workspace: <strong>{b.currency || "IDR"}</strong> — tidak berubah karena bahasa.
            </p>
          </div>
        </Card>
      </div>

      <Card
        title={tr("Pratinjau langsung")}
        desc={tr("Contoh format memakai pengaturan di atas. Tidak ada data contoh keuangan di sini.")}
        className="mt-4"
      >
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{tr("Tanggal")}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink-main">{preview.date}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{tr("Waktu")}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink-main">{preview.time}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{tr("Angka")}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink-main">{preview.number}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{tr("Mata uang")}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink-main">{preview.money}</dd>
          </div>
        </dl>
      </Card>

      {err && (
        <p role="alert" className="mt-4 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-main">
          {err}
        </p>
      )}

      <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-line bg-surface py-3">
        <Button loading={busy} onClick={() => void save()}>
          Simpan
        </Button>
      </div>
    </>
  );
}
