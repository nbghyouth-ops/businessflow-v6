"use client";

import { tr } from "@/lib/tr";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, background: "var(--color-surface-4)", color: "var(--color-ink-900)", fontFamily: "Inter, system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px" }}>
          <section role="alert" style={{ maxWidth: 560, width: "100%", background: "var(--color-white)", border: "1px solid var(--color-line)", borderRadius: 24, padding: 32 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-ink-2)", fontWeight: 700, margin: 0 }}>
              Business Flow
            </p>
            <h1 style={{ fontSize: 26, lineHeight: 1.25, margin: "10px 0 0" }}>{tr("Aplikasi mengalami gangguan")}</h1>
            <p style={{ color: "var(--color-ink-2)", fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>
              Data Anda tetap aman. Muat ulang halaman untuk melanjutkan. Bila gangguan berulang, hubungi pengelola sistem Anda.
            </p>
            {error.digest && (
              <p style={{ color: "var(--color-ink-2)", fontSize: 12, marginTop: 12 }}>
                Kode kejadian: <code>{error.digest}</code>
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
              <button
                type="button"
                onClick={reset}
                style={{ minHeight: 44, borderRadius: 12, border: "none", background: "var(--color-legacy-cobalt-deep)", color: "var(--color-white)", padding: "0 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Muat ulang
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error menggantikan root layout; muat ulang penuh memang disengaja */}
              <a
                href="/"
                style={{ minHeight: 44, display: "inline-flex", alignItems: "center", borderRadius: 12, border: "1px solid var(--color-line)", background: "var(--color-white)", color: "var(--color-ink-900)", padding: "0 20px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
              >
                Ke Beranda
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
