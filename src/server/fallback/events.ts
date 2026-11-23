import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { fallbackEvents } from "@/db/schema";
import { fallbacksEnabled } from "./flags";
import type { FallbackId } from "./registry";

export type FallbackEvent = {
  id: string;
  createdAt: Date;
  workspaceRef: string | null;
  fallbackId: string;
  trigger: string;
  outcome: string;
  detail: Record<string, unknown>;
};

export type RecordFallbackInput = {
  id: FallbackId | string;
  trigger: string;
  outcome: string;
  workspaceRef?: string | null;
  detail?: Record<string, unknown>;
};

/**
 * Throttle dalam memori: maksimum satu catatan per (fallback, trigger) per 5 detik.
 * Mencegah badai tulis saat DB/timeout berulang. Tidak pernah memblok request.
 */
const THROTTLE_MS = 5_000;
const globalForEvents = globalThis as typeof globalThis & {
  __bfFallbackThrottle?: Map<string, number>;
};

function throttled(id: string, trigger: string): boolean {
  const map = (globalForEvents.__bfFallbackThrottle ??= new Map());
  const key = `${id}|${trigger}`;
  const now = Date.now();
  const last = map.get(key) ?? 0;
  if (now - last < THROTTLE_MS) return true;
  map.set(key, now);
  if (map.size > 500) {
    for (const [k, v] of map) if (now - v > THROTTLE_MS * 4) map.delete(k);
  }
  return false;
}

/**
 * Catat aktivasi fallback secara terstruktur (F-16). TIDAK PERNAH melempar error:
 * bila tabel gagal ditulis, tulis ke console terstruktur tanpa rahasia/PII.
 */
export async function recordFallbackEvent(input: RecordFallbackInput): Promise<void> {
  try {
    if (!(await fallbacksEnabled())) return;
    if (throttled(input.id, input.trigger)) return;
    const detail = sanitizeDetail(input.detail ?? {});
    await db.insert(fallbackEvents).values({
      fallbackId: input.id,
      trigger: input.trigger,
      outcome: input.outcome,
      workspaceRef: input.workspaceRef ?? null,
      detail,
    });
  } catch {
    // F-16: log terstruktur, tanpa nilai sensitif, dan jangan blokir request.
    console.warn(
      `[fallback:event] ${JSON.stringify({
        level: "warn",
        fallbackId: input.id,
        trigger: input.trigger,
        outcome: input.outcome,
        detail: sanitizeDetail(input.detail ?? {}),
        at: new Date().toISOString(),
      })}`,
    );
  }
}

/** Buang kemungkinan nilai sensitif dari detail (kunci yang mengandung secret/token/pin/password). */
function sanitizeDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (/secret|token|password|pin|authorization|cookie|url$/i.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean" || v == null) out[k] = v;
    else out[k] = "[objek]";
  }
  return out;
}

/** Daftar aktivasi fallback terbaru untuk Status Sistem (F-15). */
export async function listFallbackEvents(hours = 24, limit = 50): Promise<FallbackEvent[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(fallbackEvents)
    .where(gte(fallbackEvents.createdAt, since))
    .orderBy(desc(fallbackEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    workspaceRef: r.workspaceRef,
    fallbackId: r.fallbackId,
    trigger: r.trigger,
    outcome: r.outcome,
    detail: (r.detail as Record<string, unknown>) ?? {},
  }));
}

/**
 * Hitung kegagalan INFRASTRUKTUR Google dalam jendela waktu (4.5.2).
 * Hanya fallback_id F-07 dengan trigger google_infra yang dihitung; kesalahan
 * input pengguna (state salah, access_denied) TIDAK pernah dicatat sebagai infra.
 */
export async function countGoogleInfraFailures(windowMinutes = 15): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fallbackEvents)
    .where(
      and(
        eq(fallbackEvents.fallbackId, "F-07"),
        eq(fallbackEvents.trigger, "google_infra"),
        gte(fallbackEvents.createdAt, since),
      ),
    );
  return Number(row?.n ?? 0);
}

export function resetFallbackEventThrottle(): void {
  globalForEvents.__bfFallbackThrottle = new Map();
}
