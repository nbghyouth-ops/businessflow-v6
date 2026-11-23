import { headers } from "next/headers";
import { tr } from "@/lib/tr";
import { InvitePanel } from "@/components/invite-panel";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { authConfigured, getUserSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terima undangan — Business Flow" };

export default async function InvitePage() {
  const configured = await authConfigured();
  const us = configured ? await getUserSession(await headers()) : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-[24px] border border-line bg-white p-8 shadow-pop">
        <BrandLogo variant="full" size="lg" />
        <h1 className="mt-6 text-[24px] font-bold text-ink">{tr("Terima undangan workspace")}</h1>
        <InvitePanel signedIn={Boolean(us)} email={us?.email ?? null} configured={configured} />
      </div>
    </main>
  );
}
