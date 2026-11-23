import { NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";
import { findDevice, findGrant } from "@/server/core";
import { revokeEmergencySessionsForDevice, revokeEmergencySessionsForWorkspace } from "@/server/fallback/emergency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notConfigured = () =>
  Response.json(
    { type: "about:blank", title: "Login Google belum dikonfigurasi.", status: 503, code: "config_missing" },
    { status: 503, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } },
  );

/** Callback Google berhasil = redirect non-error menuju callbackURL. */
function isSuccessfulGoogleCallback(req: Request, res: Response): boolean {
  try {
    if (new URL(req.url).pathname !== "/api/auth/callback/google") return false;
    if (res.status < 300 || res.status >= 400) return false;
    const location = res.headers.get("location");
    if (!location) return false;
    return !new URL(location, req.url).searchParams.has("error");
  } catch {
    return false;
  }
}

/**
 * F-06 · Login Google yang berhasil MENCABUT sesi darurat perangkat ini.
 * Pencabutan bersifat best-effort: kegagalan DB tidak boleh menggagalkan login.
 */
async function revokeEmergencyOnHealthyLogin(req: Request) {
  try {
    const device = await findDevice(new NextRequest(req));
    if (!device) return;
    await revokeEmergencySessionsForDevice(device.id, "google_login_success");
    const grant = await findGrant(device.id);
    if (grant) await revokeEmergencySessionsForWorkspace(grant.workspaceId, "google_login_success");
  } catch {
    /* jangan pernah menggagalkan login karena pencabutan sesi darurat */
  }
}

async function handle(req: Request, method: "GET" | "POST") {
  const auth = await getAuth();
  if (!auth) return notConfigured();
  const h = toNextJsHandler(auth);
  const res = await h[method](req);
  if (method === "GET" && isSuccessfulGoogleCallback(req, res)) {
    await revokeEmergencyOnHealthyLogin(req);
  }
  return res;
}
export const GET = (req: Request) => handle(req, "GET");
export const POST = (req: Request) => handle(req, "POST");
