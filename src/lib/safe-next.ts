/** Hanya rute internal yang diizinkan sebagai tujuan setelah login (anti open-redirect). */
const NEXT_ALLOWLIST = ["/", "/invite", "/settings/security", "/dashboard"];
export const safeNext = (n?: string | null) => (n && NEXT_ALLOWLIST.includes(n) ? n : "/");
