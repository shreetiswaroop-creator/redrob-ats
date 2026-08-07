import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { Requisition, REQUISITION_STATUS_ORDER, RequisitionStatus } from "@/lib/types";
import { insertNotifications, requisitionApprovedNotification } from "@/lib/notifications";

// Any recruiter can move a requisition freely between all five statuses via
// a dropdown (not a locked pipeline) — this only fires the "approved"
// notification on a genuine transition into Approved, same as the old
// approve-only action did.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const supabase = supabaseServer();

  if (body.action !== "set_status") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const status = body.status as RequisitionStatus;
  if (!REQUISITION_STATUS_ORDER.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("requisitions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }

  const update: Record<string, unknown> = { status };
  if (typeof body.note === "string") update.status_note = body.note.trim() || null;

  const enteringApproved = status === "approved" && existing.status !== "approved";
  if (enteringApproved) {
    update.approved_at = new Date().toISOString();
    update.approved_by = session.name;
  }

  const { data, error } = await supabase
    .from("requisitions")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (enteringApproved) {
    await insertNotifications(supabase, [requisitionApprovedNotification(data as Requisition)], (data as Requisition).id, null);
  }

  return NextResponse.json(data);
}
