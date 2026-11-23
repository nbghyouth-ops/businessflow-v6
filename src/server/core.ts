import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { DatabaseConfigError, db, isUndefinedTableError, withDbRetry } from "@/db";
import { authConfigured, getMembership, getUserSession, workspaceIsAccountManaged } from "./auth/session";
import { assertSchemaMigrated, SchemaNotReadyError } from "@/db/auto-migrate";
import { classifyDbFailure, withRetryAfterHeaders } from "./fallback/db-errors";
import { recordFallbackEvent } from "./fallback/events";
import { EMERGENCY_COOKIE, emergencyPermissionAllowed, resolveEmergencySessionByToken } from "./fallback/emergency";
import {
  auditEvents, businesses, deviceGrants, devices, docCounters, idempotencyKeys, tabSessions,
} from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { can, type Permission } from "@/lib/permissions";
import { dateInTz } from "@/lib/time";
import { MoneyError } from "@/lib/money";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DB = typeof db | Tx;
export type Device = typeof devices.$inferSelect;
export type Business = typeof businesses.$inferSelect;

export const DEVICE_COOKIE = "bf_device";
export const TAB_TTL_MS = 2 * 60 * 1000;
const MAX_BODY = 256 * 1024;
const MAX_UPLOAD_BODY = 4 * 1024 * 1024;

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export type Ctx = {
  deviceId: string;
  deviceName: string;
  operator: string | null;
  workspaceId: string;
  businessId: string;
  branchId: string | null;
  role: string;
  /** Terisi bila workspace dikelola akun Google (sesi valid + membership aktif). */
  userId?: string;
  /** true bila request memakai sesi darurat perangkat (4.5.2). Izin dibatasi. */
  emergency?: boolean;
  /** Identitas ruang pribadi: user Google bila ada, jika tidak "device:<id>". */
  ownerId?: string;
};

/* ───────── rate limit (in-memory best-effort + DB-backed atomic untuk endpoint sensitif) ───────── */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.n++;
  if (b.n > max) throw new HttpError(429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", "rate_limited");
}

export async function rateLimitDb(key: string, max: number, windowMs: number) {
  const resetAt = new Date(Date.now() + windowMs);
  try {
    const res = await db.execute(sql`
      INSERT INTO api_rate_limits (key, count, reset_at)
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN api_rate_limits.reset_at < now() THEN 1 ELSE api_rate_limits.count + 1 END,
        reset_at = CASE WHEN api_rate_limits.reset_at < now() THEN ${resetAt} ELSE api_rate_limits.reset_at END
      RETURNING count
    `);
    const count = Number((res.rows[0] as { count?: number } | undefined)?.count ?? 1);
    if (count > max) {
      throw new HttpError(429, "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.", "rate_limited");
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (isUndefinedTableError(err)) {
      try {
        await assertSchemaMigrated();
      } catch {
        /* F-04: tetap lanjut ke limiter cadangan */
      }
    }
    // F-05: limiter memori yang LEBIH KETAT (fail-closed) saat query DB gagal.
    void recordFallbackEvent({
      id: "F-05",
      trigger: isUndefinedTableError(err) ? "rate_limit_table_missing" : "rate_limit_db_error",
      outcome: "memory_strict",
    });
    rateLimit(`fallback:${key}`, Math.max(1, Math.floor(max / 2)), windowMs);
    return;
  }
}

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/* ───────── RLS tenant transaction helper (kompatibel PgBouncer mode transaksi) ───────── */
export async function withTenant<T>(ctx: Pick<Ctx, "workspaceId">, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.workspace_id', ${ctx.workspaceId}, true)`);
    await tx.execute(sql`SET LOCAL ROLE bf_app`);
    return fn(tx);
  });
}

/**
 * Ruang pribadi (R4): transaksi hanya menyetel app.owner_id. Policy tabel personal memakai
 * owner_id, sehingga data pribadi tidak pernah terlihat oleh workspace lain atau perangkat lain.
 */
export async function withOwner<T>(ctx: Pick<Ctx, "workspaceId" | "ownerId">, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ctx.ownerId) throw new HttpError(401, "Identitas pemilik tidak tersedia.", "owner_unknown");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.workspace_id', ${ctx.workspaceId}, true)`);
    await tx.execute(sql`SELECT set_config('app.owner_id', ${ctx.ownerId}, true)`);
    await tx.execute(sql`SET LOCAL ROLE bf_app`);
    return fn(tx);
  });
}

/* ───────── device auth (single joined query per request) ───────── */
export async function findDevice(req: NextRequest): Promise<Device | null> {
  const t = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!t || t.length > 200) return null;
  const [d] = await withDbRetry(
    () => db.select().from(devices).where(and(eq(devices.tokenHash, sha256(t)), eq(devices.status, "active"))).limit(1),
    1,
  );
  return d ?? null;
}

export async function findGrant(deviceId: string) {
  const [g] = await withDbRetry(
    () =>
      db
        .select()
        .from(deviceGrants)
        .where(and(eq(deviceGrants.deviceId, deviceId), eq(deviceGrants.status, "active")))
        .orderBy(desc(deviceGrants.createdAt))
        .limit(1),
    1,
  );
  return g ?? null;
}

async function resolveDeviceAndGrant(req: NextRequest) {
  const t = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!t || t.length > 200) return { device: null, grant: null };
  const rows = await withDbRetry(
    () =>
      db
        .select({
          device: devices,
          grant: deviceGrants,
        })
        .from(devices)
        .leftJoin(deviceGrants, and(eq(deviceGrants.deviceId, devices.id), eq(deviceGrants.status, "active")))
        .where(and(eq(devices.tokenHash, sha256(t)), eq(devices.status, "active")))
        .orderBy(desc(deviceGrants.createdAt))
        .limit(1),
    1,
  );
  const row = rows[0];
  return { device: row?.device ?? null, grant: row?.grant ?? null };
}

export async function createDevice(name = "Perangkat"): Promise<{ device: Device; token: string }> {
  const token = randomToken(32);
  const [device] = await db.insert(devices).values({ id: crypto.randomUUID(), tokenHash: sha256(token), name }).returning();
  return { device, token };
}

export function secureCookie(req: NextRequest) {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export function setDeviceCookie(res: NextResponse, req: NextRequest, token: string) {
  res.cookies.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return res;
}

export async function issueTab(deviceId: string): Promise<string> {
  const token = randomToken(32);
  await db.insert(tabSessions).values({ tokenHash: sha256(token), deviceId, expiresAt: new Date(Date.now() + TAB_TTL_MS) });
  await db
    .delete(tabSessions)
    .where(and(eq(tabSessions.deviceId, deviceId), sql`${tabSessions.expiresAt} < now() - interval '1 hour'`));
  return token;
}

async function verifyTab(req: NextRequest, deviceId: string) {
  const t = req.headers.get("x-tab-session");
  if (!t || t.length > 200) throw new HttpError(401, "Aplikasi terkunci. Masukkan PIN.", "locked");
  const [s] = await db
    .update(tabSessions)
    .set({ expiresAt: new Date(Date.now() + TAB_TTL_MS) })
    .where(
      and(
        eq(tabSessions.tokenHash, sha256(t)),
        eq(tabSessions.deviceId, deviceId),
        isNull(tabSessions.revokedAt),
        gt(tabSessions.expiresAt, sql`now()`),
      ),
    )
    .returning({ id: tabSessions.id });
  if (!s) throw new HttpError(401, "Sesi tab berakhir. Masukkan PIN.", "locked");
  return s.id;
}

export async function revokeTab(req: NextRequest) {
  const t = req.headers.get("x-tab-session");
  if (!t) return;
  await db.update(tabSessions).set({ revokedAt: new Date() }).where(eq(tabSessions.tokenHash, sha256(t)));
}

/* Pembersihan oportunistik tanpa scheduler (F-12) */
async function opportunisticHousekeeping() {
  if (Math.random() > 0.05) return;
  try {
    await db.execute(sql`DELETE FROM tab_sessions WHERE expires_at < now() - interval '2 hours'`);
    await db.execute(sql`DELETE FROM idempotency_keys WHERE created_at < now() - interval '7 days'`);
    await db.execute(sql`DELETE FROM api_rate_limits WHERE reset_at < now() - interval '1 hour'`);
  } catch {
    /* non-fatal */
  }
}

/* ───────── route framework ───────── */
export type RouteArgs = {
  req: NextRequest;
  params: Record<string, string>;
  query: URLSearchParams;
  ctx: Ctx;
  tx: DB;
  device: Device | null;
  idemKey: string | null;
  json<T>(schema: ZodType<T>): Promise<T>;
};
export type Route = {
  method: string;
  pattern: string;
  auth: "none" | "device" | "tab";
  perm?: Permission;
  maxBodyBytes?: number;
  /** true = transaksi memakai app.owner_id (ruang pribadi), bukan isolasi workspace. */
  ownerSpace?: boolean;
  handler: (a: RouteArgs) => Promise<unknown>;
};

export function r(
  method: Route["method"],
  pattern: string,
  opts: { auth?: Route["auth"]; perm?: Permission; maxBodyBytes?: number; ownerSpace?: boolean },
  handler: Route["handler"],
): Route {
  return { method, pattern, auth: opts.auth ?? "tab", perm: opts.perm, maxBodyBytes: opts.maxBodyBytes, ownerSpace: opts.ownerSpace, handler };
}

function match(pattern: string, segs: string[]): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  if (p.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(segs[i]);
    else if (p[i] !== segs[i]) return null;
  }
  return params;
}

export function problem(status: number, title: string, code: string, extra: Record<string, unknown> = {}, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(
    { type: "about:blank", title, status, code, detail: title, ...extra },
    {
      status,
      headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store", ...extraHeaders },
    },
  );
}

export async function dispatch(routes: Route[], req: NextRequest, segs: string[]): Promise<Response> {
  let currentRoute: Route | null = null;
  try {
    let found: { route: Route; params: Record<string, string> } | null = null;
    let pathMatched = false;
    for (const route of routes) {
      const params = match(route.pattern, segs);
      if (!params) continue;
      pathMatched = true;
      if (route.method === req.method) {
        found = { route, params };
        currentRoute = route;
        break;
      }
    }
    if (!found) {
      return problem(pathMatched ? 405 : 404, pathMatched ? "Metode tidak diizinkan" : "Endpoint tidak ditemukan", "not_found");
    }
    const { route, params } = found;
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    const bodyLimit = route.maxBodyBytes ?? MAX_BODY;

    rateLimit(`${clientIp(req)}:${route.auth === "none" ? route.pattern : "api"}`, route.auth === "none" ? 40 : 600, 60_000);

    if (mutating) {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== req.headers.get("host")) throw new HttpError(403, "Origin tidak diizinkan", "csrf");
      if (req.headers.get("x-requested-with") !== "bf") throw new HttpError(403, "Header permintaan tidak valid", "csrf");
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > Math.max(bodyLimit, MAX_UPLOAD_BODY)) throw new HttpError(413, "Payload terlalu besar", "payload_too_large");
    }

    // `/health` harus tetap bisa menjawab walau database/skema belum siap (Q-02).
    const publicHealth = route.auth === "none" && route.pattern === "/health";
    // BF-003: jalur request tidak pernah menjalankan DDL; hanya memverifikasi skema.
    if (!publicHealth) await assertSchemaMigrated();
    let device: Device | null = null;
    let ctx = null as unknown as Ctx;
    if (route.auth !== "none") {
      const resolved = await resolveDeviceAndGrant(req);
      device = resolved.device;
      if (!device) throw new HttpError(401, "Perangkat tidak dikenali atau telah dicabut.", "device_unknown");
      const grant = resolved.grant;
      if (grant) {
        ctx = {
          deviceId: device.id,
          deviceName: device.name,
          operator: device.operatorName,
          workspaceId: grant.workspaceId,
          businessId: grant.businessId,
          branchId: grant.branchId,
          role: grant.role,
        };
      } else if (route.auth === "tab") {
        throw new HttpError(403, "Perangkat belum memiliki akses ke bisnis.", "no_grant");
      }
      if (grant && ctx) {
        // Workspace berbasis akun: sesi Google valid + membership aktif WAJIB (irisan dengan grant perangkat).
        // Workspace lama (belum diklaim) tetap berjalan device-only sampai diklaim — lihat LEGACY_AUTH_MIGRATION.md.
        // 4.5.2: bila Google tidak dipakai/tidak tersedia, sesi darurat perangkat yang valid menjadi jalur
        // terbatas (fail-closed, izin dibatasi EMERGENCY_ALLOWED_PERMISSIONS).
        if (await workspaceIsAccountManaged(grant.workspaceId)) {
          const us = (await authConfigured()) ? await getUserSession(req.headers) : null;
          let member = null as Awaited<ReturnType<typeof getMembership>>;
          if (us) member = await getMembership(us.userId, grant.workspaceId);
          if (us && member) {
            ctx.role = member.role;
            ctx.userId = us.userId;
            if (member.branchId) ctx.branchId = member.branchId;
          } else {
            const em = await resolveEmergencySessionByToken(req.cookies.get(EMERGENCY_COOKIE)?.value);
            if (em && em.workspaceId === grant.workspaceId) {
              ctx.emergency = true;
              ctx.role = em.role;
            } else if (us) {
              throw new HttpError(403, "Akun Anda bukan anggota workspace ini.", "not_member");
            } else if (!(await authConfigured())) {
              throw new HttpError(503, "Login Google belum dikonfigurasi.", "auth_not_configured");
            } else {
              throw new HttpError(401, "Silakan masuk dengan Google.", "auth_required");
            }
          }
        }
      }
      if (ctx) ctx.ownerId = ctx.userId ?? `device:${device.id}`;
      if (route.auth === "tab") await verifyTab(req, device.id);
      if (route.perm) {
        if (!ctx || !can(ctx.role, route.perm)) {
          throw new HttpError(403, "Perangkat ini tidak memiliki izin untuk aksi tersebut.", "forbidden");
        }
        if (ctx.emergency && !emergencyPermissionAllowed(route.perm)) {
          throw new HttpError(403, "Aksi ini tidak diizinkan pada Mode Darurat. Masuk kembali dengan Google untuk melanjutkan.", "emergency_forbidden");
        }
      }

    }

    const idemRaw = req.headers.get("idempotency-key");
    const runWithDb = async (tx: DB) => {
      const args: RouteArgs = {
        req,
        params,
        query: req.nextUrl.searchParams,
        ctx,
        tx,
        device,
        idemKey: idemRaw && idemRaw.length <= 100 ? idemRaw : null,
        async json<T>(schema: ZodType<T>) {
          const text = await req.text();
          if (text.length > bodyLimit) throw new HttpError(413, "Payload terlalu besar", "payload_too_large");
          let raw: unknown;
          try {
            raw = text ? JSON.parse(text) : {};
          } catch {
            throw new HttpError(400, "JSON tidak valid", "bad_json");
          }
          return schema.parse(raw);
        },
      };
      return route.handler(args);
    };
    const result =
      route.auth === "tab"
        ? route.ownerSpace
          ? await withOwner(ctx, runWithDb)
          : await withTenant(ctx, runWithDb)
        : await runWithDb(db);
    void opportunisticHousekeeping();
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true }, { status: req.method === "POST" ? 201 : 200 });
  } catch (e) {
    if (e instanceof HttpError) return problem(e.status, e.message, e.code);
    if (e instanceof DatabaseConfigError) {
      void recordFallbackEvent({ id: "F-01", trigger: "database_config_missing", outcome: "service_status_screen" });
      return problem(503, "Database belum dikonfigurasi. Atur DATABASE_URL terlebih dahulu.", "config_missing");
    }
    if (e instanceof SchemaNotReadyError || isUndefinedTableError(e)) {
      void recordFallbackEvent({
        id: "F-04",
        trigger: e instanceof SchemaNotReadyError ? e.reason.toLowerCase() : "undefined_table",
        outcome: "schema_not_ready",
      });
      logSafeApiError("schema_not_migrated", e, currentRoute?.pattern, req.headers.get("x-request-id") ?? undefined);
      return problem(
        503,
        "Skema database belum siap. Jalankan migrasi lalu coba lagi.",
        "schema_not_ready",
        {},
        withRetryAfterHeaders(),
      );
    }
    const dbFailure = classifyDbFailure(e);
    if (dbFailure) {
      if (dbFailure.kind === "connection") {
        void recordFallbackEvent({ id: "F-03", trigger: "db_connection", outcome: "retryable_503" });
      }
      return problem(
        dbFailure.status,
        dbFailure.title,
        dbFailure.code,
        dbFailure.retryAfterSeconds ? { retryAfter: dbFailure.retryAfterSeconds } : {},
        dbFailure.retryAfterSeconds ? withRetryAfterHeaders() : {},
      );
    }
    if (e instanceof ZodError) {
      return problem(422, e.issues[0]?.message ?? "Input tidak valid", "validation", {
        errors: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (e instanceof MoneyError) return problem(422, e.message, "validation");
    const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string };
    if (pg?.code === "23505") return problem(409, "Data duplikat (nilai unik sudah ada).", "conflict");
    if (pg?.code === "23514") return problem(422, "Data melanggar aturan integritas.", "constraint");
    if (pg?.code === "23503") return problem(422, "Referensi data tidak valid.", "reference");
    // BF-106: pengenal berformat salah (mis. UUID tidak sah pada parameter path) yang diteruskan
    // ke SQL memunculkan 22P02. Dulu menjadi 500 + log galat palsu; kini ditolak rapi sebagai 422.
    if (pg?.code === "22P02") return problem(422, "Format pengenal atau nilai tidak valid.", "validation");
    if (pg?.code === "42501") return problem(403, "Akses ditolak oleh kebijakan keamanan data.", "rls_denied");
    logSafeApiError("unhandled", e, currentRoute?.pattern, req.headers.get("x-request-id") ?? undefined);
    return problem(500, "Terjadi kesalahan pada server.", "internal");
  }
}

function logSafeApiError(label: string, err: unknown, routeId?: string, requestId?: string) {
  const cause = (err as { cause?: unknown })?.cause ?? err;
  const pg = (typeof cause === "object" && cause !== null ? cause : {}) as {
    code?: string;
    constraint?: string;
    table?: string;
    column?: string;
  };
  const structured = {
    level: "error",
    label,
    routeId: routeId ?? "unknown",
    requestId: requestId ?? "none",
    errorName: (err as Error)?.name || "Error",
    sqlState: pg.code ?? null,
    table: pg.table ?? null,
    column: pg.column ?? null,
    constraint: pg.constraint ?? null,
  };
  console.error(`[api:error] ${JSON.stringify(structured)}`);
}

/* ───────── helpers ───────── */
export async function audit(
  d: DB,
  ctx: Pick<Ctx, "workspaceId" | "deviceId" | "operator">,
  action: string,
  resource: string,
  resourceId?: string | null,
  meta: Record<string, unknown> = {},
) {
  await d.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    deviceId: ctx.deviceId,
    operator: ctx.operator,
    action,
    resource,
    resourceId: resourceId ?? null,
    meta,
  });
}

export async function nextNumber(d: DB, workspaceId: string, key: string, prefix: string) {
  const [row] = await d
    .insert(docCounters)
    .values({ workspaceId, key, value: 1 })
    .onConflictDoUpdate({ target: [docCounters.workspaceId, docCounters.key], set: { value: sql`${docCounters.value} + 1` } })
    .returning({ v: docCounters.value });
  return `${prefix}-${String(row.v).padStart(5, "0")}`;
}

export async function idempotent<T>(tx: Tx, ctx: Ctx, key: string | null, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const ins = await tx
    .insert(idempotencyKeys)
    .values({ workspaceId: ctx.workspaceId, key: `${ctx.deviceId}:${key}` })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });
  if (!ins.length) {
    const [row] = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.workspaceId, ctx.workspaceId), eq(idempotencyKeys.key, `${ctx.deviceId}:${key}`)));
    if (row?.response != null) return row.response as T;
    throw new HttpError(409, "Permintaan yang sama sedang diproses.", "in_progress");
  }
  const res = await fn();
  await tx.update(idempotencyKeys).set({ response: res as unknown }).where(eq(idempotencyKeys.id, ins[0].id));
  return res;
}

export async function getBusiness(d: DB, ctx: Ctx): Promise<Business> {
  const [b] = await d.select().from(businesses).where(and(eq(businesses.id, ctx.businessId), eq(businesses.workspaceId, ctx.workspaceId)));
  if (!b) throw new HttpError(404, "Bisnis tidak ditemukan", "not_found");
  return b;
}

export function todayIn(tz: string): string {
  return dateInTz(tz);
}
