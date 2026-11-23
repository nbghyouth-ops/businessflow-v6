"use client";

import { useLang } from "./lang-provider";
import { t } from "@/lib/i18n";

/**
 * R1 — pemberitahuan record-only yang WAJIB tampil pada setiap form bernilai uang.
 *
 * UI-05: hanya bahasa aktif yang dirender (sebelumnya teks ID dan EN tampil bersamaan
 * dan layar menjadi dua bahasa).
 */
export function RecordOnlyNotice({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <p
      lang={lang}
      className={`rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink-2 ${className}`}
    >
      <span className="block font-semibold text-ink">{t(lang, "recordOnly.title")}</span>
      {t(lang, "recordOnly.body")}
    </p>
  );
}
