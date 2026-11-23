import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authEvents, authSessions, authUsers, businesses, devices, workspaceInvitations, workspaceMembers } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { clientIp, HttpError, r, type Route } from "../core";
import { listMemberships, withAuthContext, type UserSession } from "../auth/session";
import { requireUser } from "./device";

const FRESH_MINUTES = 15;
const INVITE_TTL_MS = 7 * 24 * 3600_000;
const ASSIGNABLE = ["manager", "cashier", "staff", "viewer"] as const;

/** Tindakan sensitif butuh sesi Google yang baru dibuat (login ulang) — bukan sekadar cookie lama. */
async function requireFresh(us: UserSession) {
  const [s] = await db.select({ createdAt: authSessions.createdAt }).from(authSessions).where(eq(authSessions.id, us.sessionId)).limit(1);
  if (!s || Date.now() - s.createdAt.getTime() > FRESH_MINUTES * 60_000) {
    throw new HttpError(403, "Masuk ulang dengan Google untuk melanjutkan tindakan ini.", "reauth_required");
  }
}

async function event(type: string, us: { userId: string } | null, workspaceId: string | null, ip: string, detail: Record<string, unknown> = {}) {
  await withAuthContext({ workspaceId: workspaceId ?? undefined }, (tx) =>
    tx.insert(authEvents).values({ type, userId: us?.userId ?? null, workspaceId, ip, detail }));
}

export const accountRoutes: Route[] = [
  r("GET", "/account/me", { auth: "none" }, async ({ req }) => {
    const us = await requireUser(req);
    const ms = await listMemberships(us.userId);
    const workspaces = [];
    for (const m of ms) {
      const [b] = await withAuthContext({ workspaceId: m.workspaceId }, (tx) =>
        tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.workspaceId, m.workspaceId)).limit(1));
      workspaces.push({ workspaceId: m.workspaceId, name: b?.name ?? "Workspace", role: m.role });
    }
    const [pref] = await db.select({ locale: authUsers.locale }).from(authUsers).where(eq(authUsers.id, us.userId)).limit(1);
    const payload = { user: { id: us.userId, name: us.name, email: us.email, image: us.image, locale: pref?.locale ?? null }, workspaces };
    // Respons personal WAJIB tidak di-cache: tanpa ini peramban menyajikan locale
    // lama setelah preferensi diubah, sehingga bahasa tampilan tidak berganti (REG-01).
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "private, no-store" },
    });
  }),

  // Preferensi pengguna (lintas perangkat) — bukan localStorage, bukan ENV.
  r("PATCH", "/account/preferences", { auth: "none" }, async ({ req, json }) => {
    const us = await requireUser(req);
    const b = await json(z.object({ locale: z.enum(["id", "en"]).nullable() }));
    await db.update(authUsers).set({ locale: b.locale, updatedAt: new Date() }).where(eq(authUsers.id, us.userId));
    await event("account.preferences", us, null, clientIp(req), { locale: b.locale });
    return { ok: true, locale: b.locale };
  }),

  r("GET", "/account/sessions", { auth: "none" }, async ({ req }) => {
    const us = await requireUser(req);
    const rows = await db.select({ id: authSessions.id, createdAt: authSessions.createdAt, ip: authSessions.ipAddress, userAgent: authSessions.userAgent })
      .from(authSessions).where(and(eq(authSessions.userId, us.userId), sql`${authSessions.expiresAt} > now()`)).orderBy(desc(authSessions.createdAt));
    return { sessions: rows.map((s) => ({ ...s, current: s.id === us.sessionId })) };
  }),

  r("POST", "/account/sessions/revoke", { auth: "none" }, async ({ req, json }) => {
    const us = await requireUser(req);
    const b = await json(z.object({ sessionId: z.string().max(100).optional(), all: z.boolean().optional() }).refine((x) => x.sessionId || x.all, "sessionId atau all wajib"));
    if (b.all) {
      await requireFresh(us);
      await db.delete(authSessions).where(eq(authSessions.userId, us.userId));
      await event("session.revoke_all", us, null, clientIp(req));
    } else {
      await db.delete(authSessions).where(and(eq(authSessions.id, b.sessionId!), eq(authSessions.userId, us.userId)));
      await event("session.revoke", us, null, clientIp(req), { sessionId: b.sessionId });
    }
    return { ok: true };
  }),

  r("GET", "/workspace/members", { perm: "settings:read" }, async ({ ctx }) => {
    const rows = await withAuthContext({ workspaceId: ctx.workspaceId }, (tx) =>
      tx.select({ userId: workspaceMembers.userId, role: workspaceMembers.role, status: workspaceMembers.status, name: authUsers.name, email: authUsers.email, image: authUsers.image })
        .from(workspaceMembers).innerJoin(authUsers, eq(authUsers.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, ctx.workspaceId)));
    return { members: rows };
  }),

  r("POST", "/workspace/invitations", { perm: "members:manage" }, async ({ req, ctx, json }) => {
    const b = await json(z.object({ role: z.enum(ASSIGNABLE), branchId: z.string().uuid().nullish() }));
    if (!ctx.userId) throw new HttpError(403, "Hanya akun yang dapat mengundang.", "auth_required");
    // Token membawa workspaceId agar pencarian tetap tunduk pada RLS; hanya hash-nya yang disimpan.
    const token = `${ctx.workspaceId}.${randomToken(32)}`;
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await withAuthContext({ workspaceId: ctx.workspaceId }, (tx) =>
      tx.insert(workspaceInvitations).values({ workspaceId: ctx.workspaceId, tokenHash: sha256(token), role: b.role, branchId: b.branchId ?? null, expiresAt, createdBy: ctx.userId! }));
    await event("invitation.create", { userId: ctx.userId }, ctx.workspaceId, clientIp(req), { role: b.role });
    return { token, expiresAt }; // ditampilkan SEKALI
  }),

  r("POST", "/invitations/accept", { auth: "none" }, async ({ req, json }) => {
    const us = await requireUser(req);
    const { token } = await json(z.object({ token: z.string().min(40).max(200) }));
    const wsId = token.split(".")[0];
    if (!z.string().uuid().safeParse(wsId).success) throw new HttpError(422, "Undangan tidak valid.", "invitation_invalid");
    const res = await withAuthContext({ workspaceId: wsId }, async (tx) => {
      const [inv] = await tx.select().from(workspaceInvitations)
        .where(and(eq(workspaceInvitations.tokenHash, sha256(token)), eq(workspaceInvitations.workspaceId, wsId))).for("update");
      if (!inv || inv.status !== "pending") throw new HttpError(409, "Undangan tidak valid atau sudah dipakai.", "invitation_invalid");
      if (inv.expiresAt.getTime() < Date.now()) {
        await tx.update(workspaceInvitations).set({ status: "expired" }).where(eq(workspaceInvitations.id, inv.id));
        return { expired: true as const };
      }
      const [existing] = await tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, us.userId)));
      if (existing?.status === "active") throw new HttpError(409, "Anda sudah menjadi anggota workspace ini.", "already_member");
      if (existing) await tx.update(workspaceMembers).set({ role: inv.role, status: "active", branchId: inv.branchId, updatedAt: new Date() }).where(eq(workspaceMembers.id, existing.id));
      else await tx.insert(workspaceMembers).values({ workspaceId: wsId, userId: us.userId, role: inv.role, branchId: inv.branchId });
      await tx.update(workspaceInvitations).set({ status: "accepted", acceptedBy: us.userId, acceptedAt: new Date() }).where(eq(workspaceInvitations.id, inv.id));
      await tx.insert(authEvents).values({ type: "invitation.accept", userId: us.userId, workspaceId: wsId, ip: clientIp(req), detail: { role: inv.role } });
      return { expired: false as const, role: inv.role };
    });
    if (res.expired) throw new HttpError(410, "Undangan sudah kedaluwarsa.", "invitation_expired");
    return { ok: true, workspaceId: wsId, role: res.role };
  }),

  r("PATCH", "/workspace/members/:userId", { perm: "members:manage" }, async ({ req, ctx, params, json }) => {
    const b = await json(z.object({ role: z.enum(ASSIGNABLE).optional(), status: z.enum(["active", "suspended", "removed"]).optional() }));
    if (params.userId === ctx.userId) throw new HttpError(422, "Tidak dapat mengubah keanggotaan Anda sendiri.", "self_change");
    await withAuthContext({ workspaceId: ctx.workspaceId }, async (tx) => {
      const [m] = await tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, params.userId))).for("update");
      if (!m) throw new HttpError(404, "Anggota tidak ditemukan.", "not_found");
      if (m.role === "owner") throw new HttpError(422, "Owner tidak dapat diubah. Gunakan transfer owner.", "owner_protected");
      await tx.update(workspaceMembers).set({ ...b, updatedAt: new Date() }).where(eq(workspaceMembers.id, m.id));
      await tx.insert(authEvents).values({ type: "member.update", userId: ctx.userId ?? null, workspaceId: ctx.workspaceId, ip: clientIp(req), detail: { target: params.userId, ...b } });
    });
    return { ok: true };
  }),

  // Klaim workspace lama (device-only) ke akun Google. Bukti kepemilikan: grant owner aktif + PIN perangkat terbuka (auth "tab").
  r("POST", "/workspace/claim", {}, async ({ req, ctx, device }) => {
    const us = await requireUser(req);
    if (ctx.role !== "owner") throw new HttpError(403, "Hanya owner perangkat yang dapat mengklaim workspace.", "forbidden");
    await withAuthContext({ workspaceId: ctx.workspaceId, userId: us.userId }, async (tx) => {
      await tx.execute(sql`SELECT id FROM workspaces WHERE id = ${ctx.workspaceId} FOR UPDATE`);
      const active = await tx.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.status, "active"))).limit(1);
      if (active.length) throw new HttpError(409, "Workspace ini sudah dikelola akun.", "already_claimed");
      await tx.insert(workspaceMembers).values({ workspaceId: ctx.workspaceId, userId: us.userId, role: "owner" });
      await tx.update(devices).set({ userId: us.userId }).where(eq(devices.id, device!.id));
      await tx.insert(authEvents).values({ type: "workspace.claim", userId: us.userId, workspaceId: ctx.workspaceId, ip: clientIp(req), detail: { deviceId: device!.id } });
    });
    return { ok: true };
  }),
];
