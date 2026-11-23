import { healthResponseFor, serviceStatus } from "./fallback/status";

/**
 * Satu fungsi status untuk `/api/health` dan `/api/v1/health` (Q-02).
 * Selalu 503 ramah + Retry-After saat database/skema bermasalah; tidak pernah 500 generik.
 */
export async function healthResponse(): Promise<Response> {
  try {
    return healthResponseFor(await serviceStatus());
  } catch {
    return Response.json(
      { ok: false, reason: "UNKNOWN", checks: { database: "down", schema: "not_ready", auth: "none", authMode: "unconfigured" } },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } },
    );
  }
}
