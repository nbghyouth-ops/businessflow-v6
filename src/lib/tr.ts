/**
 * Penerjemah berbasis teks sumber (source-string keys).
 *
 * Dipakai komponen panel yang sangat padat label: kunci = teks Indonesia apa adanya,
 * sehingga tidak ada risiko salah pasang kunci dan diff tetap kecil. Bahasa Inggris
 * diambil dari `ui-en.ts`; bila terjemahan belum ada, teks Indonesia dikembalikan
 * (tidak pernah kosong), dan `scripts/check-i18n.mjs` melaporkan string yang belum
 * diterjemahkan agar tidak ada klaim cakupan palsu.
 *
 * Bahasa aktif disetel `LangProvider` (perubahan bahasa memicu reload halaman,
 * jadi variabel modul ini selalu sinkron dengan render berikutnya).
 */
import { UI_EN } from "./ui-en";
import type { Lang } from "./i18n";

let active: Lang = "id";

export function setActiveLang(lang: Lang) {
  active = lang;
}

export function activeLang(): Lang {
  return active;
}

/** `tr("Simpan")` → "Save" saat bahasa aktif `en`. */
export function tr(id: string): string {
  if (active !== "en") return id;
  return UI_EN[id] ?? id;
}

/** Untuk gerbang i18n: daftar teks yang belum punya terjemahan Inggris. */
export function missingTranslations(ids: Iterable<string>): string[] {
  return [...ids].filter((id) => !UI_EN[id]);
}
