import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { fetchActiveCandidatesOwnedBy, reassignCandidateOwner } from "@/lib/candidateOwnership";

// Deactivates an account rather than deleting the row — see supabase/schema.sql's
// note on deactivated_at. Optionally takes a body of
// { reassignments: [{ candidateId, newOwnerId }] } to hand off every active
// candidate the departing person owns in the same request, so HR Management
// can't deactivate someone and forget to reassign their caseload as a
// separate step.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can deactivate accounts." }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.sub) {
    return NextResponse.json({ error: "You can't deactivate your own account while logged in." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: target } = await supabase.from("users").select("name, role, deactivated_at").eq("id", id).single();
  if (!target) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (target.deactivated_at) {
    return NextResponse.json({ error: "This account is already deactivated." }, { status: 400 });
  }

  if (target.role === "hr_management") {
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "hr_management")
      .is("deactivated_at", null);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Can't deactivate the last active HR Management account." }, { status: 400 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const reassignments = (body.reassignments ?? []) as { candidateId: string; newOwnerId: string }[];

  for (const { candidateId, newOwnerId } of reassignments) {
    const { data: newOwnerUser } = await supabase
      .from("users")
      .select("name, email, deactivated_at")
      .eq("id", newOwnerId)
      .maybeSingle();
    if (!newOwnerUser || newOwnerUser.deactivated_at) {
      return NextResponse.json(
        { error: `Invalid reassignment target for candidate ${candidateId} — that user doesn't exist or is deactivated.` },
        { status: 400 }
      );
    }
    const result = await reassignCandidateOwner(supabase, candidateId, newOwnerUser, session.name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Server-side safety net, not just trusting the client sent a complete
  // list — same "server check is the real control" principle as everywhere
  // else in this app. Blocks deactivation outright rather than silently
  // leaving orphaned active candidates behind.
  const stillOwned = await fetchActiveCandidatesOwnedBy(supabase, target.name);
  if (stillOwned.length > 0) {
    return NextResponse.json(
      {
        error: `${target.name} still owns ${stillOwned.length} active candidate(s) — reassign them before deactivating.`,
      },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("users").update({ deactivated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
