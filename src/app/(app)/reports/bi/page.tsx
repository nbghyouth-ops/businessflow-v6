import { redirect } from "next/navigation";

/** Alias PRD v6.0 (A.6): Business Intelligence. Layar nyata ada di `/insights`. */
export default function BiAlias() {
  redirect("/insights");
}
