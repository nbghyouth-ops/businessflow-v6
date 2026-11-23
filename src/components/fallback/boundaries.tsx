"use client";

import { tr } from "@/lib/tr";
import {
  Component,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";

/**
 * F-08 · Error boundary berlapis.
 * - WidgetBoundary membungkus SATU kartu/grafik/panel sehingga kegagalan lokal tidak
 *   menjatuhkan halaman.
 * - Laporan galat klien dikirim ringan (tanpa PII) ke satu endpoint ber-rate-limit.
 */
function reportClientError(scope: string, error: Error, info?: ErrorInfo) {
  try {
    const payload = JSON.stringify({
      scope,
      message: String(error.message || error.name).slice(0, 200),
      stack: String(info?.componentStack ?? "").slice(0, 500),
      path: typeof window !== "undefined" ? window.location.pathname.slice(0, 120) : "",
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/client-errors", new Blob([payload], { type: "application/json" }));
    } else {
      void fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    }
  } catch {
    /* pelaporan galat tidak boleh menggagalkan apa pun */
  }
}

type BoundaryState = { failed: boolean };

export class WidgetBoundary extends Component<
  { children: ReactNode; title?: string; scope?: string; onReset?: () => void },
  BoundaryState
> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(this.props.scope ?? this.props.title ?? "widget", error, info);
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <p className="text-sm font-semibold text-ink">{tr("Bagian ini sementara tidak dapat ditampilkan")}</p>
        <p className="mt-1 text-sm text-ink-2">
          {this.props.title ? `“${this.props.title}” ` : ""}mengalami gangguan, tetapi bagian lain halaman tetap berjalan.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-primary-bg"
        >
          Coba lagi
        </button>
      </div>
    );
  }
}

/** Boundary tingkat halaman untuk dipakai di error.tsx (client component). */
export function PageErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
      <section role="alert" className="w-full max-w-lg rounded-[24px] border border-line bg-white p-8 shadow-pop">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">{tr("Terjadi gangguan")}</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{tr("Halaman ini tidak dapat ditampilkan")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Data Anda tetap aman. Coba muat ulang halaman; bila masih gagal, kembali ke Dashboard dan lanjutkan pekerjaan lain.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-primary-deep px-5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Muat ulang
          </button>
          <a
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-5 text-sm font-semibold text-ink hover:bg-primary-bg"
          >
            Ke Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}

/* ── F-10 · Notifikasi kapabilitas peramban ── */
export function NoscriptNotice() {
  return (
    <noscript>
      <div className="fixed inset-x-0 top-0 z-[100] bg-[var(--color-warn-surface)] px-4 py-3 text-center text-sm text-[var(--color-warn-deep)]">
        JavaScript belum aktif. Aktifkan JavaScript di peramban Anda agar Business Flow dapat digunakan.
      </div>
    </noscript>
  );
}

type BrowserCaps = { old: boolean; noBlob: boolean };

const subscribeToNothing = () => () => {};
let cachedBrowserCaps: BrowserCaps | null = null;

function readBrowserCaps(): BrowserCaps {
  if (!cachedBrowserCaps) {
    cachedBrowserCaps = {
      old: typeof Promise === "undefined" || typeof fetch === "undefined" || typeof Intl === "undefined",
      noBlob: typeof URL === "undefined" || typeof URL.createObjectURL !== "function",
    };
  }
  return cachedBrowserCaps;
}

function readServerCaps(): null {
  return null;
}

export function BrowserCapabilityNotice() {
  // useSyncExternalStore dipakai agar deteksi kapabilitas terjadi setelah hidrasi
  // tanpa setState di dalam effect (menghindari render berantai).
  const caps = useSyncExternalStore<BrowserCaps | null>(subscribeToNothing, readBrowserCaps, readServerCaps);

  if (!caps || (!caps.old && !caps.noBlob)) return null;
  return (
    <div role="status" className="border-b border-[var(--color-warn-bg-strong)] bg-[var(--color-warn-surface)] px-4 py-2 text-center text-sm text-[var(--color-warn-deep)]">
      Peramban Anda terlihat lama. Sebagian fitur mungkin tampil lebih sederhana. Untuk pengalaman terbaik, perbarui Chrome, Edge, Firefox, atau Safari.
    </div>
  );
}

/* ── F-03/F-06 · Banner mode cadangan ── */
export type FallbackBannerKind = "reconnecting" | "device_mode" | "emergency" | "saved_locally";

export function FallbackBanner({
  kind,
  expiresAt,
  onDismiss,
}: {
  kind: FallbackBannerKind;
  expiresAt?: string | null;
  onDismiss?: () => void;
}) {
  const [remaining, setRemaining] = useState<string>("");

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) {
        setRemaining("berakhir");
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setRemaining(`${h > 0 ? `${h} jam ` : ""}${m} menit ${s} detik`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const styles: Record<FallbackBannerKind, string> = {
    reconnecting: "border-[var(--color-warn-bg-strong)] bg-[var(--color-warn-surface)] text-[var(--color-warn-deep)]",
    device_mode: "border-[var(--color-accent-border)] bg-primary-bg text-primary-deep",
    emergency: "border-[var(--color-coral-light)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
    saved_locally: "border-[var(--color-accent-border)] bg-primary-bg text-primary-deep",
  };

  const text: Record<FallbackBannerKind, string> = {
    reconnecting: "Sedang menyambung ulang ke database. Jangan menutup halaman ini; kami mencoba otomatis.",
    device_mode:
      "Mode Perangkat aktif: hubungkan Google untuk keamanan penuh. Selama mode ini, undangan anggota dan ekspor data pribadi dibatasi.",
    emergency: `Mode Darurat — masuk tanpa Google.${remaining ? ` Sisa waktu: ${remaining}.` : ""}`,
    saved_locally: "Perubahan terakhir belum terkirim ke server. Isian Anda tetap tersimpan di formulir.",
  };

  return (
    <div role="status" aria-live="polite" className={`flex items-start gap-3 border px-4 py-2.5 text-sm ${styles[kind]}`}>
      <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <p className="flex-1 leading-relaxed">{text[kind]}</p>
      {onDismiss && kind !== "emergency" && (
        <button type="button" onClick={onDismiss} className="min-h-[32px] shrink-0 rounded-lg px-2 text-xs font-semibold underline">
          Tutup
        </button>
      )}
    </div>
  );
}

/** Hook: pantau kegagalan fetch GET dan tampilkan banner menyambung ulang (F-03). */
export function useReconnectingBanner() {
  const [reconnecting, setReconnecting] = useState(false);
  const onFailure = useCallback(() => {
    setReconnecting(true);
    setTimeout(() => setReconnecting(false), 8000);
  }, []);
  return { reconnecting, onFailure };
}
