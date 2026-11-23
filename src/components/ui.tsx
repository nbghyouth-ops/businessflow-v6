"use client";

import { tr } from "@/lib/tr";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToasts } from "@/lib/client";
import { t, type Lang } from "@/lib/i18n";
import { useLang } from "./lang-provider";

/**
 * Terjemahan teks UI yang ikut berlangganan konteks bahasa (REG-01).
 *
 * `tr()` membaca bahasa aktif dari variabel modul yang disetel `LangProvider`.
 * Komponen dalam subtree halaman tidak dirender ulang saat preferensi pengguna
 * (en) tiba setelah render pertama, sehingga teksnya tertinggal dalam bahasa
 * awal. Hook ini berlangganan konteks agar komponen akar selalu benar.
 */
export function useTx(): (id: string) => string {
  useLang();
  return tr;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
/* v4.1: aksi = hitam var(--color-action), aksen = periwinkle. Tidak ada cobalt lagi. */
const V: Record<Variant, string> = {
  primary: "bg-[var(--color-action)] text-white hover:bg-[var(--color-action-hover)] disabled:bg-[var(--color-disabled)] shadow-none",
  secondary: "bg-white text-ink border border-line hover:bg-surface disabled:text-ink-2",
  ghost: "text-ink hover:bg-primary-bg",
  danger: "bg-white text-[var(--color-danger)] border border-[var(--color-coral-light)] hover:bg-[var(--color-danger-bg)]",
};

export function Button({ variant = "primary", loading, className = "", children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || loading} type={p.type ?? "button"}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed ${V[variant]} ${className}`}>
      {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ title, desc, actions, children, className = "", metricId }: { title?: string; desc?: string; actions?: ReactNode; children: ReactNode; className?: string; metricId?: string }) {
  // REG-01: judul/deskripsi kartu diterjemahkan DI SINI memakai bahasa aktif.
  const tx = useTx();
  return (
    <section data-metric-id={metricId} className={`min-w-0 rounded-[20px] border border-line bg-white p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">{title && <h2 className="text-[17px] font-semibold tracking-tight text-ink">{tx(title)}</h2>}{desc && <p className="mt-0.5 text-[13px] text-ink-2">{tx(desc)}</p>}</div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ label, title, desc, actions }: { label: string; title: string; desc?: string; actions?: ReactNode }) {
  // Sama seperti Card: terjemahan dilakukan pada bahasa aktif (REG-01).
  const tx = useTx();
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4" data-tour="page-header">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">{tx(label)}</p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-ink md:text-[30px]">{tx(title)}</h1>
        {desc && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">{tx(desc)}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * KPI v4.1 — tidak ada lagi palet mint/peach/butter.
 * `pastel="lavender"` (atau `accent`) = kartu periwinkle; sisanya kartu netral abu.
 * Angka memakai tabular-nums; delta memakai ikon + teks, bukan warna saja.
 */
const ACCENT_PASTELS = new Set(["lavender"]);

export function Kpi({
  label,
  value,
  hint,
  tone,
  pastel,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "bad";
  pastel?: "lavender" | "mint" | "peach" | "butter";
  icon?: ReactNode;
}) {
  const accent = pastel ? ACCENT_PASTELS.has(pastel) : false;
  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border p-5 ${
        accent ? "border-[var(--color-primary-light)] bg-[var(--color-accent)]" : "border-line bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[13px] font-semibold ${accent ? "text-[var(--color-ink)]" : "text-ink-2"}`}>{label}</p>
        {icon && (
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              accent ? "bg-white/70 text-ink" : "bg-surface text-ink-2"
            }`}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <p className={`kpi-value mt-3 text-[26px] font-semibold leading-tight tracking-tight ${tone === "bad" ? "text-[var(--color-danger)]" : "text-ink"}`}>{value}</p>
      {hint && <p className={`mt-1.5 text-xs font-medium ${accent ? "text-[var(--color-ink)]" : "text-ink-2"}`}>{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  good: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  warn: "bg-[var(--color-warn-bg)] text-[var(--color-warn-ink)]",
  bad: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  info: "bg-[var(--color-primary-bg)] text-[var(--color-on-accent)]",
  neutral: "bg-surface text-ink-2",
};
const STATUS_TONE: Record<string, string> = {
  paid: "good", posted: "good", active: "good", done: "good", completed: "good", received: "good", confirmed: "info", approved: "good", closed: "neutral",
  partial: "warn", pending_approval: "warn", ordered: "info", open: "info", in_progress: "info", draft: "neutral", todo: "neutral", planning: "neutral",
  unpaid: "warn", rejected: "bad", reversed: "bad", cancelled: "bad", revoked: "bad", blocked: "bad", urgent: "bad", high: "warn", restricted: "warn", archived: "neutral", inactive: "neutral",
};
/** UI-04: label enum lewat kamus, bukan nilai mesin mentah (`paid`, `partial`, …). */
export function statusLabel(lang: Lang, status: string): string {
  const key = `status.${status}`;
  const v = t(lang, key);
  return v === key ? status.replace(/_/g, " ") : v;
}

export function Badge({ children, tone, status }: { children?: ReactNode; tone?: keyof typeof TONES; status?: string }) {
  const lang = useLang();
  const toneKey = tone ?? (status ? STATUS_TONE[status] : undefined) ?? "neutral";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[toneKey]}`}>
      {children ?? (status ? statusLabel(lang, status) : null)}
    </span>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ text = "Memuat data…" }: { text?: string }) {
  return <p role="status" className="py-8 text-center text-sm text-ink-2">{text}</p>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-coral-light)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)]">
      <span>{message}</span>{onRetry && <Button variant="secondary" onClick={onRetry}>{tr("Coba lagi")}</Button>}
    </div>
  );
}

export function Field({ label, error, help, children, className = "" }: { label: string; error?: string; help?: string; children: (id: string, describedBy?: string) => ReactNode; className?: string }) {
  const id = useId();
  const d = error ? `${id}-e` : help ? `${id}-h` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-ink">{label}</label>
      {children(id, d)}
      {error ? <p id={`${id}-e`} role="alert" className="mt-1 text-xs text-[var(--color-danger)]">{error}</p> : help ? <p id={`${id}-h`} className="mt-1 text-xs text-ink-2">{help}</p> : null}
    </div>
  );
}
export function TextField({ label, value, onChange, type = "text", error, help, ...rest }: { label: string; value: string; onChange: (v: string) => void; type?: string; error?: string; help?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return <Field label={label} error={error} help={help}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} className="field-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />}</Field>;
}
export function SelectField({ label, value, onChange, options, error, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string; placeholder?: string }) {
  return (
    <Field label={label} error={error}>{(id, d) => (
      <select id={id} aria-describedby={d} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>)}
    </Field>
  );
}
export function TextArea({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return <Field label={label} error={error}>{(id, d) => <textarea id={id} aria-describedby={d} rows={3} className="field-input" value={value} onChange={(e) => onChange(e.target.value)} />}</Field>;
}
export function Check({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-line bg-white px-3 py-2 text-sm hover:bg-surface">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-action)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium text-ink">{label}</span>{help && <span className="block text-xs text-ink-2">{help}</span>}</span>
    </label>
  );
}

/**
 * Modal / Sheet v4.1 — menutup R-19 (REF-02).
 * - `max-height: calc(100dvh - 2rem)`, panel `flex column`, hanya body yang scroll.
 * - Header dan footer tetap terlihat; tombol aksi tidak pernah keluar layar.
 * - Ponsel = sheet penuh dari bawah dengan safe-area; fokus awal di field pertama,
 *   Esc menutup, focus trap, scroll body dikunci lalu dipulihkan.
 * `size="full"` dipakai untuk form panjang (P3) agar menjadi halaman penuh.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
  size?: "md" | "lg" | "full";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement;
    const scrollY = window.scrollY;
    const { overflow } = document.body.style;
    document.body.classList.add("bf-scroll-locked");

    const focusFirst = () => {
      const el = ref.current;
      if (!el) return;
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]") ??
        el.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)") ??
        el.querySelector<HTMLElement>("button:not(:disabled),a[href]");
      target?.focus({ preventScroll: true });
    };
    // Fokus sinkron agar pembaca layar & tes melihat fokus sudah di dalam dialog.
    focusFirst();
    const t = setTimeout(focusFirst, 30);

    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex='-1'])")].filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", key);
      document.body.classList.remove("bf-scroll-locked");
      document.body.style.overflow = overflow;
      window.scrollTo(0, scrollY);
      (prev.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  // UI-01/UI-03: overlay WAJIB portal ke document.body. Sebelumnya modal dirender di
  // dalam panel konten yang punya overflow/stacking context, sehingga header terpotong.
  if (typeof document === "undefined") return null;
  const full = size === "full";
  const width = full ? "sm:max-w-5xl" : size === "lg" || wide ? "sm:max-w-3xl" : "sm:max-w-lg";

  return createPortal(
    <div
      className="dialog-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`dialog-panel anim-sheet-up sm:anim-modal-in ${full ? "dialog-panel-full" : ""} ${width}`}
      >
        <div className="dialog-head">
          <h2 className="min-w-0 truncate text-lg font-bold text-ink">{title}</h2>
          <button
            aria-label={tr("Tutup")}
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl text-ink-2 hover:bg-surface"
          >
            ×
          </button>
        </div>
        <div ref={bodyRef} className="dialog-body">
          {children}
        </div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" className="mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white p-1">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${value === t.key ? "bg-[var(--color-action)] text-white" : "text-ink-2 hover:bg-surface hover:text-ink"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export type Col<T = any> = { key: string; label: string; right?: boolean; render?: (row: T) => ReactNode };
export function DataTable<T extends Record<string, any>>({ columns, rows, empty, caption }: { columns: Col<T>[]; rows: T[]; empty?: ReactNode; caption?: string }) {
  if (!rows.length) return <>{empty ?? <Empty title={tr("Belum ada data")} />}</>;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption ?? "Tabel data"}>
      <table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.right ? "r" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={(r.id as string) ?? i}>{columns.map((c) => <td key={c.key} className={c.right ? "r" : ""}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Toaster() {
  const items = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-20 right-4 z-[60] flex max-w-sm flex-col gap-2 sm:bottom-4">
      {items.map((t) => (
        <div key={t.id} role="status" className={`pointer-events-auto rounded-2xl px-4 py-3 text-sm font-medium shadow-pop ${t.tone === "ok" ? "bg-[var(--color-action)] text-white" : "bg-[var(--color-danger)] text-white"}`}>{t.text}</div>
      ))}
    </div>
  );
}

/**
 * Lambang merek sudah dipindahkan ke satu komponen sumber: `src/components/brand/BrandLogo`.
 * Tidak ada implementasi logo kedua di sini (prompt R10 §A4.8.3).
 */
