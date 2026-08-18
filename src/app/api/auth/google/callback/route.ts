import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";
import { exchangeCodeForTokens, fetchGoogleEmail } from "@/lib/google-oauth";
import { encryptToken } from "@/lib/token-crypto";
import { NONCE_COOKIE } from "../connect/route";

function errorRedirect(origin: string, message: string) {
  const url = new URL("/", origin);
  url.searchParams.set("google_connect_error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  if (!code || !stateRaw) return errorRedirect(req.nextUrl.origin, "Google did not return an authorization code.");

  let target: "personal" | "common";
  let nonce: string;
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
    target = parsed.target;
    nonce = parsed.nonce;
  } catch {
    return errorRedirect(req.nextUrl.origin, "Malformed state — please try connecting again.");
  }

  const cookieNonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return errorRedirect(req.nextUrl.origin, "Connection request expired or invalid — please try again.");
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    if (!tokens.refresh_token) {
      return errorRedirect(
        req.nextUrl.origin,
        "Google didn't return a refresh token — if you've connected before, revoke access at myaccount.google.com/permissions and try again."
      );
    }
    const email = await fetchGoogleEmail(tokens.access_token);
    const encrypted = encryptToken(tokens.refresh_token);

    const supabase = supabaseServer();
    if (target === "personal") {
      await supabase
        .from("users")
        .update({ gmail_email: email, gmail_refresh_token_encrypted: encrypted, gmail_connected_at: new Date().toISOString() })
        .eq("id", session.sub);
    } else {
      await supabase
        .from("org_settings")
        .update({
          common_hr_mailbox_email: email,
          common_hr_gmail_refresh_token_encrypted: encrypted,
          common_hr_gmail_connected_at: new Date().toISOString(),
        })
        .eq("id", "default");
    }

    const res = NextResponse.redirect(new URL(target === "personal" ? "/" : "/pipeline", req.nextUrl.origin));
    res.cookies.delete(NONCE_COOKIE);
    return res;
  } catch (err) {
    return errorRedirect(req.nextUrl.origin, err instanceof Error ? err.message : "Something went wrong connecting Google.");
  }
}
