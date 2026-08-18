import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = supabaseServer();
  const { data } = await supabase.from("users").select("gmail_email, gmail_connected_at").eq("id", session.sub).single();

  return NextResponse.json({
    connected: !!data?.gmail_connected_at,
    email: data?.gmail_email ?? null,
  });
}
