import { redirect } from "next/navigation";

/** Alias PRD v6.0 (A.6): tampilan KDS/antrean ada di tab Display pada `/operations`. */
export default function ProductionDisplayAlias() {
  redirect("/operations?tab=displays");
}
