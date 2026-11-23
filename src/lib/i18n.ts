/**
 * i18n internal ringan (tanpa dependensi baru).
 *
 * Sumber tunggal: `messages/id.json` dan `messages/en.json` (kunci identik, diuji).
 * Prioritas bahasa: preferensi pengguna (kolom `user.locale`) → bahasa workspace
 * (`businesses.language`) → bahasa peramban → `id`.
 */
import idMessages from "../../messages/id.json";
import enMessages from "../../messages/en.json";

export const LANGS = ["id", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const MESSAGES: Record<Lang, Record<string, string>> = {
  id: idMessages as Record<string, string>,
  en: enMessages as Record<string, string>,
};

export function normalizeLang(value: unknown): Lang {
  return value === "en" ? "en" : "id";
}

/** Pengguna menang; workspace menjadi cadangan; peramban paling akhir sebelum id. */
export function resolveLang(input: {
  userLocale?: string | null;
  workspaceLanguage?: string | null;
  navigatorLanguage?: string | null;
}): Lang {
  if (input.userLocale === "id" || input.userLocale === "en") return input.userLocale;
  if (input.workspaceLanguage === "id" || input.workspaceLanguage === "en") return input.workspaceLanguage;
  const nav = (input.navigatorLanguage ?? "").toLowerCase();
  if (nav.startsWith("en")) return "en";
  return "id";
}

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const raw = MESSAGES[normalizeLang(lang)][key] ?? MESSAGES.id[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export const label = (lang: Lang, id: string, en: string) => (normalizeLang(lang) === "en" ? en : id);

/**
 * Pseudo-locale untuk uji tata letak: setiap huruf vokal diganti aksen dan string
 * diperpanjang ± 40% agar teks panjang/terjemahan EN terdeteksi memotong layout.
 */
export function pseudo(value: string): string {
  const accented = value.replace(/[aeiouAEIOU]/g, (c) => ({ a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" })[c] ?? c);
  const pad = "·".repeat(Math.max(0, Math.ceil(value.length * 0.4)));
  return `⟦${accented}${pad}⟧`;
}

/** Semua kunci yang dipakai kode, untuk tes kunci hilang/tak terpakai. */
export function messageKeys(lang: Lang = "id"): string[] {
  return Object.keys(MESSAGES[lang]).sort();
}
