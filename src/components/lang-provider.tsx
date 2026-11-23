"use client";

/**
 * Bahasa aktif untuk komponen klien di dalam shell.
 *
 * Urutan (REG-01): preferensi pengguna → bahasa workspace → bahasa peramban → `id`.
 * Nilainya dihitung di Shell dari `/business` (yang kini memuat `userLocale`), lalu
 * dipakai komponen tanpa perlu fetch ulang agar tidak ada kilatan bahasa salah.
 */
import { createContext, Fragment, useContext } from "react";
import type { Lang } from "@/lib/i18n";
import { setActiveLang } from "@/lib/tr";

const LangCtx = createContext<Lang>("id");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  // Sinkron untuk `tr()` (teks sumber) sebelum anak-anak dirender.
  setActiveLang(lang);
  // REG-01: preferensi bahasa pengguna tiba setelah render pertama (dari
  // `/account/me`). Elemen anak yang sama tidak dirender ulang saat nilai
  // konteks berubah, sehingga teks yang dipanggil lewat `tr()` di subtree
  // tertinggal dalam bahasa awal (layar campur id+en). `key={lang}` memaksa
  // subtree dirender ulang dengan bahasa yang benar. LockProvider berada DI ATAS
  // provider ini, jadi status buka-PIN tidak ikut direset.
  return (
    <LangCtx.Provider value={lang}>
      <Fragment key={lang}>{children}</Fragment>
    </LangCtx.Provider>
  );
}

export function useLang(): Lang {
  return useContext(LangCtx);
}
