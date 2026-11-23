import type { AuthInstance } from "./factory";
import { resolveAuthConfig } from "../fallback/config";

const g = globalThis as typeof globalThis & { __bfAuth?: { key: string; inst: AuthInstance } };

/**
 * Inisialisasi MALAS: impor/build tidak pernah gagal bila ENV kosong.
 * Konfigurasi berasal dari `resolveAuthConfig()` (F-02) sehingga secret/baseURL
 * cadangan tetap bekerja tanpa ENV tambahan.
 */
export async function getAuth(): Promise<AuthInstance | null> {
  const cfg = await resolveAuthConfig();
  if (cfg.mode === "unconfigured" || !cfg.baseURL || !cfg.secret || !cfg.googleConfigured) return null;
  const key = `${cfg.baseURL}|${cfg.googleClientId}|${cfg.secretSource}`;
  if (g.__bfAuth?.key === key) return g.__bfAuth.inst;
  const { createAuth } = await import("./factory");
  const inst = createAuth({
    baseURL: cfg.baseURL,
    secret: cfg.secret,
    socialProviders: { google: { clientId: cfg.googleClientId, clientSecret: cfg.googleClientSecret, scope: ["openid", "email", "profile"] } },
  });
  g.__bfAuth = { key, inst };
  return inst;
}

/** Untuk tes: lupakan instance sehingga konfigurasi baru dipakai. */
export function resetAuthInstance(): void {
  g.__bfAuth = undefined;
}
