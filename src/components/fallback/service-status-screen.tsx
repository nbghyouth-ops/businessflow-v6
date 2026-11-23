"use client";

import { tr } from "@/lib/tr";
import { useCallback, useEffect, useRef, useState } from "react";
import { statusCopy, type ServiceStatusReason } from "@/lib/fallback/status-copy";

/**
 * F-01 · ServiceStatusScreen — satu layar status untuk seluruh keadaan gagal.
 * Tema terkunci, bahasa Indonesia, aksesibel, target sentuh ≥ 44px, retry berjeda.
 */
export function ServiceStatusScreen({
  reason,
  retryAfterSeconds = 5,
  compact = false,
  showOwnerHints = true,
}: {
  reason: Exclude<ServiceStatusReason, "OK">;
  retryAfterSeconds?: number | null;
  compact?: boolean;
  showOwnerHints?: boolean;
}) {
  const copy = statusCopy(reason);
  const initialWait = Math.min(60, Math.max(5, retryAfterSeconds ?? 5));
  const [wait, setWait] = useState(initialWait);
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const retry = useCallback(() => {
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  // Backoff ringan: 5 dtk, 10 dtk, 20 dtk, maksimum 60 dtk. Berhenti saat komponen dilepas.
  // Penghitung mundur di-reset dari dalam tick (bukan setState sinkron di body effect).
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setWait((w) => {
        if (w <= 1) {
          setAttempt((a) => a + 1);
          retry();
          const nextAttempt = Math.min(attempt + 1, 3);
          return Math.min(60, Math.max(5, (retryAfterSeconds ?? 5) * 2 ** nextAttempt));
        }
        return w - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [attempt, retryAfterSeconds, retry]);

  const toneClass =
    copy.tone === "danger"
      ? "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] border-[var(--color-coral-light)]"
      : copy.tone === "warning"
        ? "bg-[var(--color-warn-surface)] text-[var(--color-warn-deep)] border-[var(--color-warn-bg-strong)]"
        : "bg-primary-bg text-primary-deep border-[var(--color-accent-border)]";

  return (
    <main className={compact ? "" : "grid min-h-dvh place-items-center bg-surface px-4 py-10 safe-pb"}>
      <section
        aria-labelledby="service-status-title"
        className={
          compact
            ? "rounded-2xl border border-line bg-white p-5 shadow-card"
            : "w-full max-w-xl rounded-[24px] border border-line bg-white p-6 shadow-pop sm:p-9 anim-page-enter"
        }
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sidebar text-white" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">{tr("Status layanan")}</p>
            <span className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${toneClass}`}>{reason}</span>
          </div>
        </div>

        <h1 id="service-status-title" className={`font-bold text-ink ${compact ? "mt-4 text-lg" : "mt-5 text-2xl"}`}>
          {copy.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy.description}</p>

        {showOwnerHints && copy.steps.length > 0 && (
          <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">{tr("Langkah berikutnya")}</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
              {copy.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary-deep px-5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            {copy.retryLabel}
          </button>
          <a
            href="/guide"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white px-5 text-sm font-semibold text-ink hover:bg-primary-bg"
          >
            Lihat Panduan
          </a>
        </div>

        <p aria-live="polite" className="mt-3 text-xs text-ink-2">
          {wait > 0 ? `Mencoba lagi otomatis dalam ${wait} detik.` : "Mencoba lagi…"}
        </p>
      </section>
    </main>
  );
}
