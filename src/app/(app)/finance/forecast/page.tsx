import { redirect } from "next/navigation";

/** Alias PRD v6.0 (A.6): Prakiraan Kas. Layar nyata ada di `/forecast`. */
export default function ForecastAlias() {
  redirect("/forecast");
}
