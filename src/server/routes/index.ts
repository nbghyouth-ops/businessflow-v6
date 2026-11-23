import { healthResponse } from "../health";
import { eventLoopDelaySnapshot, resetEventLoopDelay } from "../perf/event-loop";
import { r, type Route } from "../core";
import { deviceRoutes } from "./device";
import { financeRoutes } from "./finance";
import { salesRoutes } from "./sales";
import { resourceRoutes } from "./resources";
import { miscRoutes } from "./misc";
import { exportRoutes } from "./exports";
import { fileRoutes } from "./files";
import { p2Routes } from "./p2";
import { prdRoutes } from "./prd";
import { accountRoutes } from "./account";
import { v6Routes } from "./v6";
import { documentRoutes } from "./documents";

export const routes: Route[] = [
  r("GET", "/health", { auth: "none" }, async () => {
    const res = await healthResponse();
    const body = (await res.clone().json()) as Record<string, unknown>;
    const retryAfter = res.headers.get("retry-after");
    return Response.json(
      { ...body, perf: eventLoopDelaySnapshot() },
      { status: res.status, headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": retryAfter } : {}) } },
    );
  }),
  // Uji beban memulai jendela pengukuran baru (tanpa efek samping pada data).
  r("POST", "/v6/perf/event-loop/reset", {}, async () => {
    resetEventLoopDelay();
    return { ok: true };
  }),
  ...deviceRoutes,
  ...accountRoutes,
  ...financeRoutes,
  ...salesRoutes,
  ...resourceRoutes,
  ...miscRoutes,
  ...exportRoutes,
  ...fileRoutes,
  ...p2Routes,
  ...prdRoutes,
  ...v6Routes,
  ...documentRoutes,
];
