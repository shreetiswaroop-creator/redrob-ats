import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const target = body.target;
  if (target !== "personal" && target !== "common") {
    return NextResponse.json({ error: "Invalid target." }, { status: 400 });
  }

  const supabase = supabaseServer();
  if (target === "personal") {
    await supabase
      .from("users")
      .update({ gmail_email: null, gmail_refresh_token_encrypted: null, gmail_connected_at: null })
      .eq("id", session.sub);
  } else {
    await supabase
      .from("org_settings")
      .update({ common_hr_mailbox_email: null, common_hr_gmail_refresh_token_encrypted: null, common_hr_gmail_connected_at: null })
      .eq("id", "default");
  }

  return NextResponse.json({ ok: true });
}
