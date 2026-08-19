import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { fetchActiveCandidatesOwnedBy } from "@/lib/candidateOwnership";

// Powers the deactivation confirmation screen — lets HR Management see
// exactly what they're about to orphan before the actual deactivate call.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can view this." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = supabaseServer();
  const { data: target } = await supabase.from("users").select("name").eq("id", id).single();
  if (!target) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const candidates = await fetchActiveCandidatesOwnedBy(supabase, target.name);
  return NextResponse.json({ candidates });
}
