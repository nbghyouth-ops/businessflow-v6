import Link from "next/link";
import { tr } from "@/lib/tr";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SignInPanel } from "@/components/sign-in-panel";
import { getUserSession } from "@/server/auth/session";
import { resolveAuthConfig } from "@/server/fallback/config";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk — Business Flow" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reason?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  const cfg = await resolveAuthConfig();
  const configured = cfg.mode !== "unconfigured";
  if (configured) {
    const us = await getUserSession(await headers());
    if (us) redirect(safeNext(sp.next));
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto grid min-h-dvh max-w-[1240px] items-stretch gap-0 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:py-10">
        {/* Kartu masuk */}
        <section className="flex flex-col justify-center" aria-labelledby="signin-title">
          <div className="w-full max-w-[460px]">
            <Link href="/" aria-label={tr("Kembali ke halaman awal Business Flow")}>
              <BrandLogo variant="full" size="xl" priority />
            </Link>
            <h1 id="signin-title" className="mt-7 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[30px]">
              Masuk ke Business Flow
            </h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
              Gunakan akun Google Anda. Data bisnis Anda disimpan di database Business Flow, bukan di Google, dan dapat
              dibuka dari perangkat mana pun.
            </p>

            <div className="mt-6 rounded-[24px] border border-line bg-[var(--color-surface-2)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[16px] font-bold text-ink">{tr("Masuk ke Workspace Anda")}</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10.5px] font-bold text-ink-2">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
                  OAuth 2.0
                </span>
              </div>
              <SignInPanel configured={configured} reason={sp.reason} error={sp.error} next={safeNext(sp.next)} />
            </div>

            <p className="mt-5 text-center text-xs text-ink-2">
              Belum punya workspace?{" "}
              <Link href="/onboarding" className="font-semibold text-ink underline">
                Siapkan bisnis baru
              </Link>
            </p>
          </div>
        </section>

        {/* Kubah periwinkle (desktop) */}
        <aside className="hidden lg:flex lg:items-center">
          <div className="arch relative w-full overflow-hidden px-9 pb-10 pt-16">
            <div className="relative mx-auto max-w-[360px] rounded-[24px] bg-white/80 p-5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-on-accent)]">{tr("Yang Anda dapatkan")}</p>
              <ul className="mt-3 space-y-2.5 text-[13.5px] text-ink">
                {[
                  "Satu tempat untuk penjualan, stok, kas, dan laporan.",
                  "Data tersimpan di server, bukan hanya di perangkat ini.",
                  "Perangkat tetap dikunci PIN sebagai lapisan kedua.",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-action)]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative mt-6 text-center text-[11.5px] font-medium text-[var(--color-on-accent)]">
              Google hanya memverifikasi identitas Anda.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
