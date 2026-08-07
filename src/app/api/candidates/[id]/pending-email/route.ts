import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("notifications")
    .select("id, subject, scheduled_send_at")
    .eq("candidate_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  return NextResponse.json({ pendingEmail: data?.[0] ?? null });
}
