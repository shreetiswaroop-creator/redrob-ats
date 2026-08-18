import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionUser } from "@/lib/session";
import { buildGoogleAuthUrl } from "@/lib/google-oauth";

export const NONCE_COOKIE = "google_oauth_nonce";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const target = req.nextUrl.searchParams.get("target");
  if (target !== "personal" && target !== "common") {
    return NextResponse.json({ error: "Invalid target." }, { status: 400 });
  }

  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ target, nonce })).toString("base64url");
  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;

  const res = NextResponse.redirect(buildGoogleAuthUrl({ state, redirectUri }));
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
