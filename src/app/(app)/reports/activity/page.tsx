import { redirect } from "next/navigation";

/** Alias PRD v6.0 (A.6): ringkasan aktivitas berada di Pusat Ekspor (`/reports/export`). */
export default function ActivityReportAlias() {
  redirect("/reports/export");
}
