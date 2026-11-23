/** Navigasi penuh (muat ulang dokumen) — sengaja, agar status di memori (unlock/PIN, cache) bersih setelah keluar. */
export function hardNavigate(path: string) {
  window.location.replace(path);
}
