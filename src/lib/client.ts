"use client";
import { runWithDownloadProgress } from "@/components/download-loader";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

/* Token sesi tab hanya hidup di memori modul (per dokumen/tab). Tidak pernah ke storage. */
let tabToken: string | null = null;
let onLocked: (() => void) | null = null;
export const getTab = () => tabToken;
export const setTab = (t: string | null) => {
  tabToken = t;
};
export const registerLockHandler = (fn: (() => void) | null) => {
  onLocked = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public errors?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; idem?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "x-requested-with": "bf" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (tabToken) headers["x-tab-session"] = tabToken;
  if (opts.idem) headers["idempotency-key"] = opts.idem;
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* kosong */
  }
  if (!res.ok) {
    if (res.status === 401 && data?.code === "locked") onLocked?.();
    throw new ApiError(res.status, data?.detail ?? data?.title ?? "Terjadi kesalahan", data?.code ?? "error", data?.errors);
  }
  return data as T;
}

/**
 * Permintaan yang mengembalikan BERKAS (bukan JSON) — mis. ekspor XLSX/CSV.
 * Header tab sama dengan `api()` sehingga sesi tab 2 menit tetap berlaku.
 */
export async function apiFile(
  path: string,
  body: unknown,
): Promise<{ blob: Blob; filename: string; rows: number | null }> {
  const headers: Record<string, string> = { "x-requested-with": "bf", "content-type": "application/json" };
  if (tabToken) headers["x-tab-session"] = tabToken;
  const res = await fetch(`/api/v1${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) {
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* kosong */
    }
    if (res.status === 401 && data?.code === "locked") onLocked?.();
    throw new ApiError(res.status, data?.detail ?? data?.title ?? `HTTP ${res.status}`, data?.code ?? "error", data?.errors);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "ekspor.bin";
  const rowsHeader = res.headers.get("x-export-rows");
  return { blob: await res.blob(), filename, rows: rowsHeader ? Number(rowsHeader) : null };
}

export const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();

type ApiState<T> = { data: T | null; error: string | null; loading: boolean };
type ApiAction<T> =
  | { type: "start" }
  | { type: "ok"; data: T }
  | { type: "err"; error: string };

function apiReducer<T>(state: ApiState<T>, action: ApiAction<T>): ApiState<T> {
  if (action.type === "start") return { ...state, loading: true };
  if (action.type === "ok") return { data: action.data, error: null, loading: false };
  return { ...state, error: action.error, loading: false };
}

/**
 * Ambil BERKAS biner (mis. PDF dokumen) dengan sesi tab yang sama. Dipakai pratinjau agar
 * yang tampil benar-benar berkas yang sama dengan yang diunduh.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = { "x-requested-with": "bf" };
  if (tabToken) headers["x-tab-session"] = tabToken;
  const res = await fetch(`/api/v1${path}`, { headers, cache: "no-store", credentials: "same-origin" });
  if (!res.ok) {
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* kosong */
    }
    if (res.status === 401 && data?.code === "locked") onLocked?.();
    throw new ApiError(res.status, data?.detail ?? data?.title ?? "Gagal mengunduh berkas", data?.code ?? "error");
  }
  return res.blob();
}

export function useApi<T = any>(path: string | null) {
  const [state, dispatch] = useReducer(apiReducer<T>, { data: null, error: null, loading: Boolean(path) });
  const seq = useRef(0);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!path) return;
    let active = true;
    const my = ++seq.current;
    Promise.resolve()
      .then(() => {
        if (active && my === seq.current) dispatch({ type: "start" });
        return api<T>(path);
      })
      .then((d) => {
        if (active && my === seq.current) dispatch({ type: "ok", data: d });
      })
      .catch((e) => {
        if (active && my === seq.current) dispatch({ type: "err", error: (e as Error).message });
      });
    return () => {
      active = false;
    };
  }, [path, tick]);

  return { data: state.data, error: state.error, loading: path ? state.loading : false, reload };
}

/* CSV dengan perlindungan formula injection. */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, any>[]) {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    columns.map((c) => esc(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")),
  ].join("\r\n");
}
export function downloadCsv(name: string, columns: { key: string; label: string }[], rows: Record<string, any>[]) {
  void runWithDownloadProgress(name, "CSV", async (setStep) => {
    setStep("Menyusun berkas CSV…", 65);
    const blob = new Blob(["\uFEFF" + toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

/* Toast sederhana. */
type ToastMsg = { id: number; text: string; tone: "ok" | "err" };
const listeners = new Set<(t: ToastMsg) => void>();
let tid = 0;
export const toast = (text: string, tone: "ok" | "err" = "ok") =>
  listeners.forEach((l) => l({ id: ++tid, text, tone }));
export function useToasts() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const l = (t: ToastMsg) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), 4500);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return items;
}

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return x.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
export const toInputDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
