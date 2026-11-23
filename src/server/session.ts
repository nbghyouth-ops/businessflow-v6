import { cookies, headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { DatabaseConfigError, db, isDatabaseConfigured, isUndefinedTableError, withDbRetry } from "@/db";
import { assertSchemaMigrated, SchemaNotReadyError } from "@/db/auto-migrate";
import { businesses, deviceGrants, devices } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { DEVICE_COOKIE } from "./core";
import { getMembership, getUserSession, authConfigured, workspaceIsAccountManaged } from "./auth/session";
import { EMERGENCY_COOKIE, resolveEmergencySessionByToken } from "./fallback/emergency";

export type GrantSessionResult =
  | {
      status: "ok";
      grant: { businessName: string; deviceName: string; operatorName: string | null; pinLength: number } | null;
      /** true bila workspace dikelola akun dan sesi Google tidak valid / bukan anggota. */
      accountRequired?: boolean;
      /** true bila request memakai sesi darurat perangkat (4.5.2). */
      emergency?: { expiresAt: string } | null;
      /** Mode auth workspace: google (default) atau device (Mode Perangkat Bootstrap). */
      authMode?: "google" | "device";
    }
  | {
      status: "db_error";
      reason: "DATABASE_URL_MISSING" | "DATABASE_URL_INVALID" | "SCHEMA_NOT_MIGRATED" | "SCHEMA_NOT_READY" | "CONNECTION_ERROR";
    };

/** Untuk Server Component: hanya info non-sensitif (nama bisnis/perangkat) agar layar PIN dapat ditampilkan. */
export async function getSessionState(): Promise<GrantSessionResult> {
  if (!isDatabaseConfigured()) {
    return { status: "db_error", reason: "DATABASE_URL_MISSING" };
  }
  try {
    await assertSchemaMigrated();
    const token = (await cookies()).get(DEVICE_COOKIE)?.value;
    if (!token || token.length > 200) {
      // Verify schema exists even if no cookie yet so first-time visitors see friendly migration screen
      await withDbRetry(() => db.select({ id: businesses.id }).from(businesses).limit(1), 1);
      return { status: "ok", grant: null };
    }
    const rows = await withDbRetry(
      () =>
        db
          .select({
            deviceName: devices.name,
            operatorName: devices.operatorName,
            pinLength: devices.pinLength,
            businessName: businesses.name,
            workspaceId: deviceGrants.workspaceId,
            authMode: sql<"google" | "device">`coalesce((select auth_mode from workspaces w where w.id = ${deviceGrants.workspaceId}), 'google')`,
          })
          .from(devices)
          .innerJoin(deviceGrants, and(eq(deviceGrants.deviceId, devices.id), eq(deviceGrants.status, "active")))
          .innerJoin(businesses, eq(businesses.id, deviceGrants.businessId))
          .where(and(eq(devices.tokenHash, sha256(token)), eq(devices.status, "active")))
          .orderBy(desc(deviceGrants.createdAt))
          .limit(1),
      1,
    );
    const row = rows[0];
    if (!row) return { status: "ok", grant: null };
    let accountRequired = false;
    let emergency: { expiresAt: string } | null = null;
    if (await workspaceIsAccountManaged(row.workspaceId)) {
      const us = (await authConfigured()) ? await getUserSession(await headers()) : null;
      if (us && (await getMembership(us.userId, row.workspaceId))) {
        accountRequired = false;
      } else {
        const token = (await cookies()).get(EMERGENCY_COOKIE)?.value;
        const em = await resolveEmergencySessionByToken(token);
        if (em && em.workspaceId === row.workspaceId) {
          emergency = { expiresAt: em.expiresAt.toISOString() };
        } else {
          accountRequired = true;
        }
      }
    }
    return {
      status: "ok",
      accountRequired,
      emergency,
      authMode: row.authMode ?? "google",
      grant: {
        businessName: row.businessName ?? "Business Flow",
        deviceName: row.deviceName,
        operatorName: row.operatorName,
        pinLength: row.pinLength ?? 6,
      },
    };
  } catch (err) {
    if (err instanceof DatabaseConfigError) return { status: "db_error", reason: err.reason };
    if (err instanceof SchemaNotReadyError) return { status: "db_error", reason: "SCHEMA_NOT_READY" };
    if (isUndefinedTableError(err)) return { status: "db_error", reason: "SCHEMA_NOT_MIGRATED" };
    return { status: "db_error", reason: "CONNECTION_ERROR" };
  }
}

export async function currentGrant() {
  const res = await getSessionState();
  return res.status === "ok" ? res.grant : null;
}
