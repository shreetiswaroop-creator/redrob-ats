import { cookies } from "next/headers";
import { SESSION_COOKIE, SessionPayload, verifySessionToken } from "./session";

// For Server Components / server-rendered pages (uses next/headers, which
// proxy.ts can't import) — reads the already-verified-by-proxy cookie so
// pages can render the logged-in user's name/role without another round trip.
export async function getSessionUserFromCookies(): Promise<SessionPayload | null> {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) return null;
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value, secret);
}
