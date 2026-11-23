import { checkDatabaseHealth } from "@/db";
import { resolveAuthConfig, type ResolvedAuthConfig } from "./config";

/**
 * F-01 · Sumber kebenaran TUNGGAL status layanan.
 * Dipakai oleh `/api/health`, `/api/v1/health`, layar status, dan halaman Status Sistem.
 */
export type ServiceStatusReason =
  | "OK"
  | "DATABASE_URL_MISSING"
  | "DATABASE_URL_INVALID"
  | "SCHEMA_NOT_MIGRATED"
  | "SCHEMA_NOT_READY"
  | "CONNECTION_ERROR"
  | "AUTH_NOT_CONFIGURED"
  | "MAINTENANCE"
  | "UNKNOWN";

export type ServiceStatus = {
  ok: boolean;
  reason: ServiceStatusReason;
  retryAfterSeconds: number | null;
  /** enforce = role runtime tidak bisa melewati RLS; bypass_risk = superuser/BYPASSRLS. */
  rlsRuntime: "enforce" | "bypass_risk" | "unknown";
  database: { state: "ok" | "down"; latencyMs: number | null };
  schema: { state: "ok" | "not_ready" };
  auth: {
    mode: ResolvedAuthConfig["mode"];
    googleConfigured: boolean;
    secretSource: ResolvedAuthConfig["secretSource"];
    baseURLSource: ResolvedAuthConfig["baseURLSource"];
    /** Ketersediaan login yang bisa dipakai pengguna sekarang. */
    loginAvailable: "google" | "device" | "none";
  };
};

const RETRY_AFTER_SECONDS = 5;

export async function serviceStatus(): Promise<ServiceStatus> {
  const [dbHealth, auth] = await Promise.all([checkDatabaseHealth(), resolveAuthConfig()]);

  const loginAvailable: ServiceStatus["auth"]["loginAvailable"] = auth.googleConfigured
    ? "google"
    : "device";

  const authState = {
    mode: auth.mode,
    googleConfigured: auth.googleConfigured,
    secretSource: auth.secretSource,
    baseURLSource: auth.baseURLSource,
    loginAvailable,
  };

  if (!dbHealth.ok) {
    const reason: ServiceStatusReason =
      dbHealth.reason === "SCHEMA_NOT_MIGRATED" || dbHealth.reason === "SCHEMA_NOT_READY"
        ? "SCHEMA_NOT_READY"
        : dbHealth.reason;
    return {
      ok: false,
      reason,
      retryAfterSeconds: dbHealth.reason === "DATABASE_URL_MISSING" || dbHealth.reason === "DATABASE_URL_INVALID" ? null : RETRY_AFTER_SECONDS,
      rlsRuntime: dbHealth.rlsRuntime ?? "unknown",
      database: { state: "down", latencyMs: null },
      schema: { state: dbHealth.reason === "SCHEMA_NOT_MIGRATED" || dbHealth.reason === "SCHEMA_NOT_READY" ? "not_ready" : "ok" },
      auth: authState,
    };
  }

  // Aplikasi tetap dapat dipakai dalam Mode Perangkat Bootstrap meski Google belum aktif,
  // jadi status tidak dianggap mati. `degraded` dikomunikasikan lewat reason.
  if (!auth.googleConfigured) {
    return {
      ok: true,
      reason: auth.mode === "unconfigured" ? "OK" : "AUTH_NOT_CONFIGURED",
      retryAfterSeconds: null,
      rlsRuntime: dbHealth.rlsRuntime,
      database: { state: "ok", latencyMs: dbHealth.latencyMs },
      schema: { state: "ok" },
      auth: authState,
    };
  }

  if (!auth.secret || !auth.baseURL) {
    return {
      ok: false,
      reason: "AUTH_NOT_CONFIGURED",
      retryAfterSeconds: null,
      rlsRuntime: dbHealth.rlsRuntime,
      database: { state: "ok", latencyMs: dbHealth.latencyMs },
      schema: { state: "ok" },
      auth: authState,
    };
  }

  return {
    ok: true,
    reason: "OK",
    retryAfterSeconds: null,
    rlsRuntime: dbHealth.rlsRuntime,
    database: { state: "ok", latencyMs: dbHealth.latencyMs },
    schema: { state: "ok" },
    auth: authState,
  };
}

export function healthResponseFor(status: ServiceStatus): Response {
  const body = {
    ok: status.ok,
    ...(status.ok ? {} : { reason: status.reason }),
    checks: {
      database: status.database.state,
      schema: status.schema.state,
      auth: status.auth.loginAvailable,
      authMode: status.auth.mode,
      // Aman: status saja, tanpa nama role/DSN.
      rls_runtime: status.rlsRuntime,
    },
  };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (status.retryAfterSeconds) headers["Retry-After"] = String(status.retryAfterSeconds);
  return Response.json(body, { status: status.ok ? 200 : 503, headers });
}
