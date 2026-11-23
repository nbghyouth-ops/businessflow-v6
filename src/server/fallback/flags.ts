import { eq } from "drizzle-orm";
import { db } from "@/db";
import { systemFlags } from "@/db/schema";
import { FALLBACKS_ENABLED_CONSTANT } from "./registry";

/**
 * Saklar global fallback (kontrak 4.1 butir 7).
 *
 * PENTING: fungsi ini HANYA dipanggil dari dalam jalur fallback (setelah jalur utama
 * gagal) sehingga jalur sehat tidak pernah menambah query database.
 */
const CACHE_TTL_MS = 30_000;
const globalForFlags = globalThis as typeof globalThis & {
  __bfFallbacksEnabled?: { value: boolean; at: number };
};

export function fallbacksEnabledConstant(): boolean {
  return FALLBACKS_ENABLED_CONSTANT;
}

/** Baca saklar dari DB dengan cache pendek. Kegagalan DB = tetap aktif (fail-soft ketersediaan). */
export async function fallbacksEnabled(): Promise<boolean> {
  if (!FALLBACKS_ENABLED_CONSTANT) return false;
  const now = Date.now();
  const cached = globalForFlags.__bfFallbacksEnabled;
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  let value = true;
  try {
    const [row] = await db.select({ value: systemFlags.value }).from(systemFlags).where(eq(systemFlags.key, "fallbacks_enabled")).limit(1);
    if (row) value = Boolean(row.value);
  } catch {
    // Tidak bisa membaca saklar: fallback tetap aktif agar layanan tidak ikut mati.
    value = true;
  }
  globalForFlags.__bfFallbacksEnabled = { value, at: now };
  return value;
}

/** Dipakai halaman Status Sistem (owner/admin) setelah re-auth PIN. */
export async function setFallbacksEnabled(enabled: boolean): Promise<void> {
  await db
    .insert(systemFlags)
    .values({ key: "fallbacks_enabled", value: enabled })
    .onConflictDoUpdate({ target: systemFlags.key, set: { value: enabled, updatedAt: new Date() } });
  globalForFlags.__bfFallbacksEnabled = { value: enabled, at: Date.now() };
}

/** Hanya untuk tes: lupakan cache. */
export function resetFallbackFlagsCache(): void {
  globalForFlags.__bfFallbacksEnabled = undefined;
}
