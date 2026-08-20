import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/api/auth/forgot-password") ||
    pathname.startsWith("/api/auth/reset-password") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/redrob-logo.png" ||
    // GET is intentionally public here (see src/app/api/org-settings/logo/route.ts)
    // — RedrobLogo renders on the login page, before anyone has a session.
    (pathname === "/api/org-settings/logo" && req.method === "GET")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.APP_SESSION_SECRET;
  const session = secret ? await verifySessionToken(token, secret) : null;

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Hiring Manager gets a single dedicated review screen and nothing else —
  // enforced structurally here rather than trusting every one of the 40+
  // files that branch on session.role to individually get this right. Any
  // other page redirects to their review screen; any other API route gets a
  // flat 403. The two routes this role IS allowed to call (resume GET,
  // candidates PATCH) still do their own ownership/action checks server-side
  // — this middleware only decides which paths a request can reach at all.
  if (session.role === "hiring_manager") {
    const isAllowedApi =
      pathname.startsWith("/api/hiring-manager/") ||
      pathname === "/api/logout" ||
      (/^\/api\/candidates\/[^/]+\/resume$/.test(pathname) && req.method === "GET") ||
      (/^\/api\/candidates\/[^/]+$/.test(pathname) && req.method === "PATCH");

    if (pathname.startsWith("/api/")) {
      if (!isAllowedApi) {
        return NextResponse.json({ error: "Not authorized." }, { status: 403 });
      }
    } else if (pathname !== "/hiring-manager") {
      return NextResponse.redirect(new URL("/hiring-manager", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
