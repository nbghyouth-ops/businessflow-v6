import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emergencySessions } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import type { Permission } from "@/lib/permissions";

/**
 * 4.5.2 · Masuk Darurat Perangkat.
 *
 * Sesi darurat = cookie terpisah `bf_emergency` (hash di DB), maksimum 8 jam,
 * TIDAK dapat diperpanjang otomatis, dan izinnya dibatasi daftar eksplisit.
 * Fail-closed: izin tidak dikenal = ditolak.
 */
export const EMERGENCY_COOKIE = "bf_emergency";
export const EMERGENCY_TTL_MS = 8 * 60 * 60 * 1000;
export const EMERGENCY_MAX_FAILURES = 5;
export const EMERGENCY_INFRA_THRESHOLD = 3;
export const EMERGENCY_INFRA_WINDOW_MINUTES = 15;

/**
 * Daftar izin yang DIIZINKAN pada sesi darurat: operasional harian saja.
 * Dilarang: anggota/peran/undangan, perangkat lain, PIN, kebijakan keamanan,
 * ekspor PII massal, tutup periode, hapus data, transfer/hapus owner/workspace.
 */
export const EMERGENCY_ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set<string>([
  "sales:read", "sales:write", "sales:create",
  "inventory:read", "inventory:write",
  "purchasing:read", "purchasing:write",
  "crm:read", "crm:write",
  "booking:read", "booking:write",
  "ops:read", "ops:write",
  "tasks:read", "tasks:write",
  "reports:read",
  "export:read", "export:create",
  "finance:read",
]);

export function emergencyPermissionAllowed(perm: Permission | string): boolean {
  return EMERGENCY_ALLOWED_PERMISSIONS.has(perm);
}

export type EmergencySessionInfo = { workspaceId: string; role: string; expiresAt: Date; sessionId: string };

export async function resolveEmergencySessionByToken(token: string | null | undefined): Promise<EmergencySessionInfo | null> {
  if (!token || token.length > 200) return null;
  try {
    const [row] = await db
      .select({
        id: emergencySessions.id,
        workspaceId: emergencySessions.workspaceRef,
        role: emergencySessions.role,
        expiresAt: emergencySessions.expiresAt,
      })
      .from(emergencySessions)
      .where(
        and(
          eq(emergencySessions.tokenHash, sha256(token)),
          isNull(emergencySessions.revokedAt),
          gt(emergencySessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row ? { sessionId: row.id, workspaceId: row.workspaceId, role: row.role, expiresAt: row.expiresAt } : null;
  } catch {
    // Fail-closed: kegagalan DB tidak pernah dianggap sesi valid.
    return null;
  }
}

export async function revokeEmergencySessionsForDevice(deviceId: string, reason: string): Promise<void> {
  try {
    await db
      .update(emergencySessions)
      .set({ revokedAt: new Date(), revokedReason: reason.slice(0, 80) })
      .where(and(eq(emergencySessions.deviceId, deviceId), isNull(emergencySessions.revokedAt)));
  } catch {
    /* pencabutan tidak boleh menggagalkan alur utama */
  }
}

export async function revokeEmergencySessionsForWorkspace(workspaceId: string, reason: string): Promise<void> {
  await db
    .update(emergencySessions)
    .set({ revokedAt: new Date(), revokedReason: reason.slice(0, 80) })
    .where(and(eq(emergencySessions.workspaceRef, workspaceId), isNull(emergencySessions.revokedAt)));
}
