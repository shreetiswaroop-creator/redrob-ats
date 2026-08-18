import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = supabaseServer();
  const { data } = await supabase.from("users").select("tour_completed_at").eq("id", session.sub).single();

  return NextResponse.json({ completed: !!data?.tour_completed_at });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("users")
    .update({ tour_completed_at: new Date().toISOString() })
    .eq("id", session.sub);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
