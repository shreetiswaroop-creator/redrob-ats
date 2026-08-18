import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { generatePasswordResetToken, hashResetToken } from "@/lib/password";
import { sendPasswordResetEmail } from "@/lib/passwordReset";
import { OrgSettings } from "@/lib/types";

const RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

// Always returns the same generic response regardless of whether the email
// matches an account — this is a public, unauthenticated endpoint, and
// telling a caller "no account with that email" would let anyone enumerate
// who has a Redrob ATS login.
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("email", String(email).toLowerCase().trim())
    .maybeSingle();

  if (user) {
    const token = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_LIFETIME_MS).toISOString();
    await supabase
      .from("users")
      .update({ password_reset_token_hash: hashResetToken(token), password_reset_expires_at: expiresAt })
      .eq("id", user.id);

    const { data: orgRow } = await supabase.from("org_settings").select("live_sending_enabled").eq("id", "default").single();
    const resetUrl = `${req.nextUrl.origin}/reset-password?token=${token}`;
    await sendPasswordResetEmail(supabase, (orgRow as Pick<OrgSettings, "live_sending_enabled">) ?? { live_sending_enabled: false }, {
      to: user.email,
      recipientName: user.name,
      resetUrl,
    });
  }

  return NextResponse.json({ ok: true });
}
