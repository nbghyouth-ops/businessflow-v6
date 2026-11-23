import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/db";
import { appSecrets } from "@/db/schema";
import { recordFallbackEvent } from "./events";

/**
 * F-02 · Fallback konfigurasi auth TANPA ENV baru.
 *
 * Aturan keras:
 * - `baseURL` HANYA boleh berasal dari ENV resmi atau variabel sistem platform tepercaya
 *   (`VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`). TIDAK PERNAH dari header Host/Origin.
 * - Secret cadangan dibangkitkan acak 32 byte, disimpan di `app_secrets` (non-tenant),
 *   dan tidak pernah dikirim ke klien/log.
 * - Hasil dihitung SEKALI lalu di-cache. Jalur sehat (ENV valid) tidak menyentuh DB.
 */

export type AuthConfigSource = "env" | "fallback";
export type AuthConfigMode = "env" | "fallback" | "unconfigured";

export type ResolvedAuthConfig = {
  mode: AuthConfigMode;
  baseURL: string | null;
  secret: string | null;
  secretSource: AuthConfigSource | null;
  baseURLSource: AuthConfigSource | null;
  googleClientId: string;
  googleClientSecret: string;
  googleConfigured: boolean;
  /** Alasan non-teknis untuk layar status; tidak memuat nilai secret. */
  reason: "SECRET_UNAVAILABLE" | "BASE_URL_UNAVAILABLE" | "GOOGLE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE" | null;
};

export const APP_SECRET_KEY = "better_auth_secret";
const MIN_SECRET_LENGTH = 32;

const globalForAuthConfig = globalThis as typeof globalThis & {
  __bfAuthConfig?: { key: string; value: ResolvedAuthConfig };
};

function envCacheKey(env: NodeJS.ProcessEnv): string {
  return [
    env.BETTER_AUTH_SECRET?.trim() ?? "",
    env.BETTER_AUTH_URL?.trim() ?? "",
    env.GOOGLE_CLIENT_ID?.trim() ?? "",
    env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ?? "",
    env.VERCEL_URL?.trim() ?? "",
  ].join("|");
}

function envSecret(env: NodeJS.ProcessEnv): string | null {
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function envBaseURL(env: NodeJS.ProcessEnv): string | null {
  const raw = env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!/^https?:\/\//.test(raw)) return null;
  try {
    const u = new URL(raw);
    return u.hostname ? u.origin : null;
  } catch {
    return null;
  }
}

/** Hanya variabel platform tepercaya. Header permintaan tidak pernah dipakai. */
function platformBaseURL(env: NodeJS.ProcessEnv): string | null {
  const raw = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim() || "";
  if (!raw) return null;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.hostname ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Bangkitkan/baca secret cadangan. Dipanggil hanya ketika ENV tidak valid,
 * sehingga jalur sehat tidak menambah query.
 */
async function fallbackSecret(): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const { assertSchemaMigrated } = await import("@/db/auto-migrate");
    await assertSchemaMigrated();
    const [existing] = await db
      .select({ value: appSecrets.value })
      .from(appSecrets)
      .where(eq(appSecrets.key, APP_SECRET_KEY))
      .limit(1);
    if (existing?.value && existing.value.length >= MIN_SECRET_LENGTH) return existing.value;

    const generated = randomBytes(32).toString("base64url");
    await db.insert(appSecrets).values({ key: APP_SECRET_KEY, value: generated }).onConflictDoNothing();
    const [again] = await db
      .select({ value: appSecrets.value })
      .from(appSecrets)
      .where(eq(appSecrets.key, APP_SECRET_KEY))
      .limit(1);
    return again?.value ?? generated;
  } catch {
    return null;
  }
}

export async function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): Promise<ResolvedAuthConfig> {
  const cacheKey = envCacheKey(env);
  if (globalForAuthConfig.__bfAuthConfig?.key === cacheKey) {
    return globalForAuthConfig.__bfAuthConfig.value;
  }

  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const googleConfigured = Boolean(googleClientId && googleClientSecret);

  let secret = envSecret(env);
  let secretSource: AuthConfigSource | null = secret ? "env" : null;
  let baseURL = envBaseURL(env);
  let baseURLSource: AuthConfigSource | null = baseURL ? "env" : null;
  let reason: ResolvedAuthConfig["reason"] = null;

  if (!baseURL) {
    baseURL = platformBaseURL(env);
    baseURLSource = baseURL ? "fallback" : null;
  }

  // Secret cadangan hanya dibutuhkan bila Google benar-benar dikonfigurasi.
  if (!secret && googleConfigured) {
    secret = await fallbackSecret();
    secretSource = secret ? "fallback" : null;
  }

  let mode: AuthConfigMode = "unconfigured";
  if (googleConfigured && secret && baseURL) {
    mode = secretSource === "env" && baseURLSource === "env" ? "env" : "fallback";
  } else if (!googleConfigured) {
    reason = "GOOGLE_NOT_CONFIGURED";
  } else if (!secret) {
    reason = "SECRET_UNAVAILABLE";
  } else if (!baseURL) {
    reason = "BASE_URL_UNAVAILABLE";
  }

  const value: ResolvedAuthConfig = {
    mode,
    baseURL,
    secret,
    secretSource,
    baseURLSource,
    googleClientId,
    googleClientSecret,
    googleConfigured,
    reason,
  };
  globalForAuthConfig.__bfAuthConfig = { key: cacheKey, value };

  if (mode === "fallback") {
    // Catat aktivasi (tidak pernah melempar, hanya pada jalur cadangan).
    await recordFallbackEvent({
      id: "F-02",
      trigger: secretSource === "fallback" && baseURLSource === "fallback"
        ? "secret_and_base_url"
        : secretSource === "fallback"
          ? "secret"
          : "base_url",
      outcome: "auth_config_resolved",
      detail: { secretSource, baseURLSource },
    });
  }

  return value;
}

/** Mode Perangkat Bootstrap hanya boleh tampil bila instance benar-benar belum siap Google. */
export function deviceBootstrapAllowed(cfg: ResolvedAuthConfig): boolean {
  return cfg.mode === "unconfigured" && !cfg.googleConfigured;
}

export function resetAuthConfigCache(): void {
  globalForAuthConfig.__bfAuthConfig = undefined;
}
