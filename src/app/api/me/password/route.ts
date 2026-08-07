import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password) {
    return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });
  }
  if (String(new_password).length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: user, error: fetchError } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", session.sub)
    .single();

  if (fetchError || !user || !(await verifyPassword(current_password, user.password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const { error } = await supabase
    .from("users")
    .update({ password_hash: await hashPassword(new_password) })
    .eq("id", session.sub);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
