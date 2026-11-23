import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirect OPTIMISTIK berdasarkan keberadaan cookie sesi. BUKAN autentikasi:
 * seluruh API dan halaman tetap memvalidasi sesi + membership di server.
 * Tidak berjalan di /api/*, aset statis, dan /sign-in.
 */
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export function proxy(req: NextRequest) {
  const has = SESSION_COOKIES.some((c) => req.cookies.get(c)?.value);
  if (!has && req.nextUrl.pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/onboarding/:path*"] };
