"use client";

import { PageErrorFallback } from "@/components/fallback/boundaries";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  void error;
  return <PageErrorFallback onRetry={reset} />;
}
