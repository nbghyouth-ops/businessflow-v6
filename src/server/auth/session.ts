import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { authEvents, authUsers, workspaceMembers } from "@/db/schema";
import { getAuth } from "./index";
import { resolveAuthConfig } from "../fallback/config";

export type UserSession = { userId: string; sessionId: string; email: string; name: string; image: string | null };
export type Membership = { workspaceId: string; role: string; status: string; branchId: string | null; warehouseId: string | null };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Transaksi dengan konteks RLS untuk pembacaan oleh service auth (bukan jalan pintas ke data tenant). */
export async function withAuthContext<T>(ctx: { workspaceId?: string; userId?: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (ctx.workspaceId) await tx.execute(sql`SELECT set_config('app.workspace_id', ${ctx.workspaceId}, true)`);
    if (ctx.userId) await tx.execute(sql`SELECT set_config('app.user_id', ${ctx.userId}, true)`);
    return fn(tx);
  });
}

/** Validasi sesi di SERVER (keberadaan cookie ≠ autentikasi). Mengembalikan null bila tidak valid/dicabut/user nonaktif. */
export async function getUserSession(headers: Headers): Promise<UserSession | null> {
  const auth = await getAuth();
  if (!auth) return null;
  const s = await auth.api.getSession({ headers });
  if (!s?.user || !s.session) return null;
  const [u] = await db.select({ status: authUsers.status, emailVerified: authUsers.emailVerified }).from(authUsers).where(eq(authUsers.id, s.user.id)).limit(1);
  if (!u || u.status !== "active" || !u.emailVerified) return null;
  return { userId: s.user.id, sessionId: s.session.id, email: s.user.email, name: s.user.name, image: s.user.image ?? null };
}

export async function authConfigured(): Promise<boolean> {
  const cfg = await resolveAuthConfig();
  return cfg.mode !== "unconfigured";
}

export async function workspaceIsAccountManaged(workspaceId: string): Promise<boolean> {
  const rows = await withAuthContext({ workspaceId }, (tx) =>
    tx.select({ id: workspaceMembers.id }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.status, "active"))).limit(1));
  return rows.length > 0;
}

export async function getMembership(userId: string, workspaceId: string): Promise<Membership | null> {
  const rows = await withAuthContext({ workspaceId, userId }, (tx) =>
    tx.select({
      workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role, status: workspaceMembers.status,
      branchId: workspaceMembers.branchId, warehouseId: workspaceMembers.warehouseId,
    }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active"))).limit(1));
  return rows[0] ?? null;
}

export async function listMemberships(userId: string): Promise<Membership[]> {
  return withAuthContext({ userId }, (tx) =>
    tx.select({
      workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role, status: workspaceMembers.status,
      branchId: workspaceMembers.branchId, warehouseId: workspaceMembers.warehouseId,
    }).from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active"))));
}

export async function recordAuthEvent(
  e: { type: string; userId?: string | null; workspaceId?: string | null; ip?: string | null; userAgent?: string | null; detail?: Record<string, unknown> },
) {
  try {
    await withAuthContext({ workspaceId: e.workspaceId ?? undefined }, (tx) =>
      tx.insert(authEvents).values({
        type: e.type, userId: e.userId ?? null, workspaceId: e.workspaceId ?? null, ip: e.ip ?? null, userAgent: e.userAgent ?? null, detail: e.detail ?? {},
      }));
  } catch {
    /* audit tidak boleh menggagalkan alur utama */
  }
}
