"use client";
import { useCallback, useState } from "react";

/**
 * Store memori modul (hanya hidup di RAM tab JS saat ini, tidak pernah ke localStorage/sessionStorage/cookie).
 * Mempertahankan keranjang POS, draft form, dan filter saat PIN dikunci & dibuka kembali di dokumen yang sama.
 * Refresh atau tab baru otomatis mulai bersih.
 */
const memStore = new Map<string, unknown>();

export function getDraft<T>(key: string, fallback: T): T {
  return memStore.has(key) ? (memStore.get(key) as T) : fallback;
}

export function setDraft<T>(key: string, value: T): void {
  memStore.set(key, value);
}

export function clearDraft(key: string): void {
  memStore.delete(key);
}

export function useMemoryDraft<T>(key: string, initial: T | (() => T)) {
  const [val, setVal] = useState<T>(() => {
    if (memStore.has(key)) return memStore.get(key) as T;
    const init = typeof initial === "function" ? (initial as () => T)() : initial;
    memStore.set(key, init);
    return init;
  });

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setVal((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        memStore.set(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [val, update] as const;
}
