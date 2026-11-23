/** Status konfigurasi auth. Tidak pernah membocorkan nilai maupun nama secret ke klien. */
export type AuthConfigStatus =
  | { configured: true; baseURL: string; secret: string; googleClientId: string; googleClientSecret: string }
  | { configured: false; missing: string[] };

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfigStatus {
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  const baseURL = env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") ?? "";
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const missing: string[] = [];
  if (secret.length < 32) missing.push("BETTER_AUTH_SECRET");
  if (!/^https?:\/\//.test(baseURL)) missing.push("BETTER_AUTH_URL");
  if (!googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) return { configured: false, missing };
  return { configured: true, baseURL, secret, googleClientId, googleClientSecret };
}

export const isAuthConfigured = () => readAuthConfig().configured;

/** Nama cookie sesi aplikasi (prefix `__Secure-` otomatis di HTTPS oleh Better Auth). */
export const SESSION_COOKIE_BASE = "better-auth.session_token";
