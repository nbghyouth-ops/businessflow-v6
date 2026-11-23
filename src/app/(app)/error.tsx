"use client";

import { useEffect } from "react";
import { PageErrorFallback } from "@/components/fallback/boundaries";

/** F-08: error di dalam area aplikasi tetap menampilkan shell-friendly fallback. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        scope: "app",
        message: String(error.message || "error").slice(0, 200),
        digest: error.digest ?? null,
        path: window.location.pathname.slice(0, 120),
      });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/client-errors", new Blob([payload], { type: "application/json" }));
    } catch {
      /* abaikan */
    }
  }, [error]);

  return (
    <div className="p-4 sm:p-6">
      <PageErrorFallback onRetry={reset} />
    </div>
  );
}
