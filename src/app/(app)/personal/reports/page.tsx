import { redirect } from "next/navigation";

/** Alias PRD v6.0 (A.6): laporan pribadi berada di layar `/personal` (owner saja). */
export default function PersonalReportsAlias() {
  redirect("/personal?tab=reports");
}
