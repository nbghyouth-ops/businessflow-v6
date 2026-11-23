export function redactSecrets(input: string): string {
  return input
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "[REDACTED_DB_URL]")
    .replace(/bf_(?:device|tab)=[^;\s]+/gi, "[REDACTED_COOKIE]")
    .replace(/(token_hash|pin_hash|password|secret|authorization)\s*[:=]\s*['"]?[^\s'",}]+/gi, "$1=[REDACTED]")
    .replace(/\bparams:\s*\[[^\]]*\]/gi, "params:[REDACTED]");
}

export interface ApiErrorLog {
  requestId: string;
  routeId: string;
  err: unknown;
}

export function logApiError({ requestId, routeId, err }: ApiErrorLog): void {
  const pg = ((err as { cause?: unknown })?.cause ?? err) as {
    code?: string;
    constraint?: string;
    table?: string;
    column?: string;
    name?: string;
  };
  const payload = {
    level: "error",
    ts: new Date().toISOString(),
    requestId,
    routeId,
    code: pg?.code ?? null,
    constraint: pg?.constraint ?? null,
    table: pg?.table ?? null,
    column: pg?.column ?? null,
    errorType: pg?.name ?? (err instanceof Error ? err.name : "UnknownError"),
  };
  console.error(JSON.stringify(payload));
}
