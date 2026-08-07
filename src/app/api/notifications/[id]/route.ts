import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: notification, error: fetchError } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !notification) {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }
  if (notification.status !== "pending") {
    return NextResponse.json({ error: "Only a pending email can be cancelled." }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ status: "cancelled", cancel_reason: `Manually cancelled by ${session.name}` })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (notification.candidate_id) {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("audit_log")
      .eq("id", notification.candidate_id)
      .single();
    if (candidate) {
      const auditLog = appendAudit(
        candidate.audit_log as Candidate["audit_log"],
        session.name,
        "Cancelled pending email",
        `"${notification.subject}"`
      );
      await supabase.from("candidates").update({ audit_log: auditLog }).eq("id", notification.candidate_id);
    }
  }

  return NextResponse.json({ ok: true });
}
