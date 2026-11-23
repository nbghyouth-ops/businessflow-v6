import Link from "next/link";
import { tr } from "@/lib/tr";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DbStatusScreen } from "@/components/db-status-screen";
import { LandingPreview } from "@/components/landing-preview";
import { SignInPanel } from "@/components/sign-in-panel";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { authConfigured, getUserSession } from "@/server/auth/session";
import { resolveAuthConfig } from "@/server/fallback/config";
import { getSessionState } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Business Flow — Keuangan bisnis & pribadi dalam satu dashboard",
  description:
    "Business Flow menyatukan penjualan, stok, keuangan, klien, dan laporan dalam satu dashboard. Masuk dengan akun Google; data disimpan di database Business Flow.",
};

export default async function Welcome() {
  const session = await getSessionState();
  if (session.status === "db_error") {
    return <DbStatusScreen reason={session.reason} />;
  }
  if (session.grant) redirect(session.accountRequired ? "/sign-in?reason=session" : "/dashboard");

  const cfg = await resolveAuthConfig();
  const configured = cfg.mode !== "unconfigured";
  const us = configured ? await getUserSession(await headers()) : null;

  return (
    <div className="min-h-dvh bg-white">
      {/* Navbar 80 px (64 px di ponsel), blur + border tipis */}
      <header className="sticky top-0 z-30 border-b border-line/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-5 sm:h-20 sm:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-accent)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-action)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 17l5-6 4 3 8-9" />
                <path d="M16 5h4v4" />
              </svg>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[17px] font-bold tracking-tight text-ink sm:text-[19px]">{tr("Business Flow")}</span>
              <span className="block text-[10px] font-medium tracking-wide text-ink-2">by nbghstudio</span>
            </span>
          </Link>

          <nav aria-label={tr("Navigasi halaman awal")} className="ml-6 hidden items-center gap-6 md:flex">
            <a href="#fitur" className="text-[13.5px] font-medium text-ink-2 hover:text-ink">{tr("Fitur Utama")}</a>
            <a href="#fitur" className="text-[13.5px] font-medium text-ink-2 hover:text-ink">{tr("Keuangan Bisnis")}</a>
            <a href="#keamanan" className="text-[13.5px] font-medium text-ink-2 hover:text-ink">{tr("Keamanan")}</a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <a href="#masuk" className="hidden min-h-[44px] items-center px-3 text-sm font-semibold text-ink sm:inline-flex">
              Masuk
            </a>
            <Link href={us ? "/onboarding" : "/sign-in"} className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--color-action)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-action-hover)]">
              Mulai Sekarang
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: 6 + 6 */}
        <section className="hero-glow">
          <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-2 lg:gap-12 lg:py-16">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--color-action)]" />
                Platform keuangan bisnis &amp; pribadi terpadu
              </p>
              <h1 className="mt-4 text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[44px] xl:text-[52px]">
                Kendalikan <span className="hl-periwinkle">arus kas</span> keuangan bisnis dan keuangan pribadi dalam satu dashboard.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--color-body)] sm:text-[16.5px]">
                Penjualan, stok, pembelian, klien, dan laporan tersambung ke satu pembukuan. Anda melihat angka yang sama
                di kantor maupun di ponsel, tanpa memindahkan data secara manual.
              </p>

              {/* Kartu login (D2 §5.2) */}
              <div id="masuk" className="mt-7 max-w-[520px] rounded-[24px] border border-line bg-[var(--color-surface-2)] p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[19px] font-bold tracking-tight text-ink">{tr("Masuk ke Workspace Anda")}</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10.5px] font-bold text-ink-2">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
                    OAuth 2.0
                  </span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                  Gunakan akun Google untuk verifikasi identitas instan. Data keuangan Anda dikelola mandiri di database
                  Business Flow.
                </p>

                {us ? (
                  <div className="mt-5">
                    <p className="rounded-2xl bg-white p-3 text-sm text-ink">
                      Anda sudah masuk sebagai <strong>{us.email}</strong>. Lanjutkan menyiapkan workspace.
                    </p>
                    <Link href="/onboarding" className="mt-3 inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[var(--color-action)] px-5 text-[15px] font-semibold text-white">
                      Lanjutkan penyiapan
                    </Link>
                  </div>
                ) : (
                  <SignInPanel configured={configured} next="/" />
                )}

                <div className="mt-5 flex gap-3 border-t border-line pt-4">
                  <span aria-hidden className="mt-0.5 text-ink-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-ink-2">
                    <strong className="font-semibold text-ink">{tr("Privasi terjamin:")}</strong> kami hanya memverifikasi nama,
                    email terverifikasi, dan foto profil Anda. Kami tidak pernah mengakses Gmail, Drive, atau kalender Anda.
                  </p>
                </div>
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-ink-2">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary-light)]" />
                  Multi-akun kas &amp; bank — pembukuan usaha dan kas pribadi tetap terpisah rapi.
                </p>
              </div>
            </div>

            <div className="min-w-0">
              <LandingPreview />
            </div>
          </div>
        </section>

        {/* Fitur utama */}
        <section id="fitur" className="border-t border-line">
          <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 lg:py-16">
            <h2 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">{tr("Satu alur kerja, tujuh belas modul")}</h2>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[var(--color-body)]">
              Setiap modul memakai data yang sama. Penjualan mengurangi stok dan menambah kas; pembelian menambah utang;
              laporan membaca jurnal yang sudah terposting.
            </p>
            <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { t: "Keuangan & pembukuan", d: "Kas/bank, jurnal berpasangan, piutang, utang, periode, laba rugi, dan neraca." },
                { t: "Penjualan & kasir", d: "POS dengan shift kas, diskon, pembayaran manual, dan struk PDF/JPG/PNG." },
                { t: "Produk & stok", d: "Katalog, mutasi stok, opname, transfer antar gudang, dan valuasi persediaan." },
                { t: "Klien / CRM", d: "Direktori klien, riwayat transaksi, dan pengingat tindak lanjut." },
                { t: "Karyawan & HR", d: "Jadwal shift, absensi, cuti, dan payroll dengan pratinjau sebelum posting." },
                { t: "Laporan & ekspor", d: "Katalog laporan dengan filter periode serta ekspor PDF, XLSX, dan CSV." },
              ].map((f) => (
                <li key={f.t} className="rounded-[20px] border border-line bg-white p-5">
                  <h3 className="text-[15px] font-bold text-ink">{f.t}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{f.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Keamanan */}
        <section id="keamanan" className="border-t border-line bg-[var(--color-surface-2)]">
          <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:py-16">
            <div>
              <h2 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">{tr("Akun Google, kunci perangkat, dan data di kendali Anda")}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--color-body)]">
                Google hanya memverifikasi identitas. Setiap perangkat tetap dikunci PIN sebagai lapisan kedua, dan
                pemilik dapat mencabut akses perangkat kapan saja.
              </p>
            </div>
            <ul className="grid gap-3">
              {[
                "Login hanya dengan Google — tanpa kata sandi yang bisa dicuri.",
                "Satu akun Google = satu workspace; data klien tersimpan di database, bukan di perangkat.",
                "PIN 4–6 digit dengan hash Argon2id dan kunci otomatis saat layar ditinggalkan.",
                "Setiap perangkat dapat dicabut; audit aktivitas tercatat tanpa data sensitif.",
              ].map((t) => (
                <li key={t} className="flex gap-3 rounded-2xl bg-white p-4 text-[13.5px] text-ink">
                  <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[11px] font-bold text-ink">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-8 text-xs text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandLogo variant="full" size="sm" />
          <nav aria-label={tr("Tautan kaki")} className="flex flex-wrap gap-4">
            <Link href="/legal" className="hover:text-ink hover:underline">Syarat &amp; Privasi</Link>
            <Link href="/help" className="hover:text-ink hover:underline">{tr("Bantuan")}</Link>
            <Link href="/sign-in" className="hover:text-ink hover:underline">Masuk</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
