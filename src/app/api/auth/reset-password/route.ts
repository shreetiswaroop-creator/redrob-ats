import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { hashPassword, hashResetToken } from "@/lib/password";

export async function POST(req: NextRequest) {
  const { token, new_password } = await req.json();
  if (!token || !new_password) {
    return NextResponse.json({ error: "Reset token and new password are required." }, { status: 400 });
  }
  if (String(new_password).length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: user } = await supabase
    .from("users")
    .select("id, password_reset_expires_at")
    .eq("password_reset_token_hash", hashResetToken(token))
    .maybeSingle();

  if (!user || !user.password_reset_expires_at || new Date(user.password_reset_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({
      password_hash: await hashPassword(new_password),
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
