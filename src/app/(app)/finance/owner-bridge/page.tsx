import { redirect } from "next/navigation";

/** Alias PRD v6.0 (A.6): Jembatan Owner–Bisnis. Layar nyata ada di `/bridge`. */
export default function OwnerBridgeAlias() {
  redirect("/bridge");
}
