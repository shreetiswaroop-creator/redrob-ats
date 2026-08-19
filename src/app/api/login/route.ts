import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { AppUser } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const sessionSecret = process.env.APP_SESSION_SECRET;

  if (!sessionSecret) {
    return NextResponse.json({ error: "Server is not configured with APP_SESSION_SECRET." }, { status: 500 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", String(email).toLowerCase().trim())
    .maybeSingle();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  if (user.deactivated_at) {
    return NextResponse.json({ error: "This account has been deactivated. Contact HR Management." }, { status: 403 });
  }

  const appUser = user as AppUser & { password_hash: string };
  const token = await createSessionToken(appUser, sessionSecret);

  const res = NextResponse.json({ ok: true, user: { id: appUser.id, name: appUser.name, email: appUser.email, role: appUser.role } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
