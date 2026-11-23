import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F-08 · Satu endpoint laporan galat klien, ber-rate-limit, TANPA PII dan TANPA database.
 * Sengaja tidak menyentuh DB agar tetap bekerja saat database bermasalah.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map<string, { n: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { n: 1, reset: now + WINDOW_MS });
    if (buckets.size > 2000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return false;
  }
  b.n += 1;
  return b.n > MAX_PER_WINDOW;
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\r\n\t]/g, " ").slice(0, max) : "";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return new Response(null, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const structured = {
      level: "warn",
      label: "client_error",
      scope: clean(body.scope, 40) || "unknown",
      message: clean(body.message, 200),
      digest: clean(body.digest, 80) || null,
      path: clean(body.path, 120),
      at: new Date().toISOString(),
    };
    console.warn(`[client:error] ${JSON.stringify(structured)}`);
  } catch {
    /* laporan galat tidak pernah menggagalkan apa pun */
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
