import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authSessions, authUsers, authVerifications } from "@/db/schema";

export type AuthFactoryInput = {
  baseURL: string;
  secret: string;
  /** Penyedia identitas. Produksi: hanya Google. Tes: plugin OIDC tiruan disuntik dari tests/. */
  socialProviders?: BetterAuthOptions["socialProviders"];
  plugins?: BetterAuthOptions["plugins"];
  trustedOrigins?: string[];
  /** Batas permintaan login/callback per IP per jendela (default 20/60 dtk). */
  rateLimit?: { max: number; window: number; customRules?: Record<string, false | { max: number; window: number }> };
};

/**
 * Satu-satunya tempat konfigurasi Better Auth dibuat.
 * - sesi disimpan di Neon (tabel session), cookie HttpOnly, SameSite=Lax
 * - TANPA email/password, TANPA auto-link akun berdasarkan email
 * - tolak email Google yang belum terverifikasi dan user yang dinonaktifkan
 */
export function createAuth(input: AuthFactoryInput) {
  const secure = input.baseURL.startsWith("https://");
  return betterAuth({
    baseURL: input.baseURL,
    secret: input.secret,
    basePath: "/api/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: input.socialProviders,
    plugins: input.plugins,
    trustedOrigins: input.trustedOrigins ?? [input.baseURL],
    account: { accountLinking: { enabled: false } },
    // Rate limit lintas instance: disimpan di Neon (tabel auth_rate_limits), bukan memori proses.
    rateLimit: {
      enabled: true,
      window: input.rateLimit?.window ?? 60,
      max: input.rateLimit?.max ?? 20,
      ...(input.rateLimit?.customRules ? { customRules: input.rateLimit.customRules } : {}),
      customStorage: {
        // Atomik: cek + increment dalam SATU pernyataan (tidak ada celah baca-basi di bawah beban paralel).
        consume: async (key: string, rule: { window: number; max: number }) => {
          const now = Date.now();
          const r = await db.execute(sql`
            INSERT INTO auth_rate_limits (key, count, last_request) VALUES (${key}, 1, ${now})
            ON CONFLICT (key) DO UPDATE SET
              count = CASE WHEN auth_rate_limits.last_request < ${now - rule.window * 1000} THEN 1 ELSE auth_rate_limits.count + 1 END,
              last_request = CASE WHEN auth_rate_limits.last_request < ${now - rule.window * 1000} THEN ${now} ELSE auth_rate_limits.last_request END
            RETURNING count, last_request`);
          const row = r.rows[0] as { count: number; last_request: string };
          const allowed = Number(row.count) <= rule.max;
          const retryAfter = allowed ? null : Math.max(1, Math.ceil((Number(row.last_request) + rule.window * 1000 - now) / 1000));
          return { allowed, retryAfter };
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: secure,
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.emailVerified) return false; // email Google wajib terverifikasi
            return { data: user };
          },
        },
      },
      account: {
        create: {
          // Kebijakan privasi: token Google TIDAK disimpan (hanya sub/provider). Kami hanya memakai Google untuk verifikasi identitas.
          before: async (account) => ({
            data: { ...account, accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null },
          }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [u] = await db.select({ status: authUsers.status }).from(authUsers).where(eq(authUsers.id, session.userId)).limit(1);
            if (!u || u.status !== "active") return false;
            return { data: session };
          },
        },
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
