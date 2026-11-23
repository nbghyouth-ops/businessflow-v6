import { ServiceStatusScreen } from "./fallback/service-status-screen";

/**
 * F-01: dipertahankan sebagai nama lama agar pemanggil tidak berubah,
 * tetapi seluruh tampilan memakai ServiceStatusScreen terpadu.
 */
export function DbStatusScreen({
  reason,
}: {
  reason: "DATABASE_URL_MISSING" | "DATABASE_URL_INVALID" | "SCHEMA_NOT_MIGRATED" | "SCHEMA_NOT_READY" | "CONNECTION_ERROR";
}) {
  return <ServiceStatusScreen reason={reason} />;
}
