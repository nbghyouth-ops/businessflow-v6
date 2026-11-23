/**
 * F-10/F-11 · Helper aman untuk data, format, dan kapabilitas browser.
 * Semua fungsi di sini TIDAK PERNAH melempar; nilai aneh dikembalikan sebagai "—".
 */

export const DEFAULT_LOCALE = "id-ID";
export const DEFAULT_TIMEZONE = "Asia/Jakarta";
export const DEFAULT_CURRENCY = "IDR";

/** Zona waktu tidak valid → Asia/Jakarta. */
export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Lokal tidak valid → id-ID. */
export function safeLocale(locale: string | null | undefined): string {
  if (!locale) return DEFAULT_LOCALE;
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length ? locale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function safeCurrency(currency: string | null | undefined): string {
  return typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY;
}

export function formatOrDash(value: unknown, formatter: (v: string) => string = (v) => v): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const out = formatter(String(value));
    if (!out || out === "NaN" || out === "undefined" || out === "null" || out === "[object Object]") return "—";
    return out;
  } catch {
    return "—";
  }
}

export function formatDate(value: Date | string | null | undefined, opts: { tz?: string; locale?: string } = {}): string {
  if (!value) return "—";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(safeLocale(opts.locale), {
      timeZone: safeTimezone(opts.tz),
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
}

export function formatDateTime(value: Date | string | null | undefined, opts: { tz?: string; locale?: string } = {}): string {
  if (!value) return "—";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(safeLocale(opts.locale), {
      timeZone: safeTimezone(opts.tz),
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

export function formatNumber(value: unknown, maxFractionDigits = 0): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, { maximumFractionDigits: maxFractionDigits }).format(n);
  } catch {
    return "—";
  }
}

/* ── Kapabilitas browser (F-10) ── */
export type Capabilities = {
  intersectionObserver: boolean;
  viewTransitions: boolean;
  structuredClone: boolean;
  intl: boolean;
  blobDownload: boolean;
  share: boolean;
};

export function detectCapabilities(): Capabilities {
  if (typeof window === "undefined") {
    return { intersectionObserver: false, viewTransitions: false, structuredClone: false, intl: true, blobDownload: false, share: false };
  }
  return {
    intersectionObserver: typeof (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver === "function",
    viewTransitions: typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition === "function",
    structuredClone: typeof (window as unknown as { structuredClone?: unknown }).structuredClone === "function",
    intl: typeof Intl !== "undefined",
    blobDownload: typeof URL !== "undefined" && typeof URL.createObjectURL === "function",
    share: typeof (navigator as unknown as { share?: unknown }).share === "function",
  };
}

/** Tumpukan font sistem selalu dipakai (tanpa font eksternal). */
export const SYSTEM_FONT_STACK = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
