import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { CustomFieldDefinition, OrgSettings, Requisition, REQUISITION_STATUS_ORDER, REQUISITION_URGENCY_ORDER, RequisitionStatus } from "@/lib/types";
import { EMPTY_ORG_SETTINGS, insertNotifications, requisitionApprovedNotification } from "@/lib/notifications";
import { validateCustomFieldValues } from "@/lib/customFields";

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

  const { data: existing, error: fetchError } = await supabase
    .from("requisitions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }

  // Brings an on-hold-timeout-archived position back to life. Fulfilled/
  // Expired archives aren't revocable here — that's a closed chapter, not a
  // reopened one. Gated the same as the On Hold transition itself — a
  // recruiter can't undo a state only HR Management could set.
  if (body.action === "revoke") {
    if (session.role !== "hr_management") {
      return NextResponse.json({ error: "Only HR Management can revoke an archived position." }, { status: 403 });
    }
    if (!existing.archived || existing.archived_reason !== "on_hold_timeout") {
      return NextResponse.json(
        { error: "Only a position archived for being on hold too long can be revoked." },
        { status: 400 }
      );
    }
    const { data, error } = await supabase
      .from("requisitions")
      .update({ archived: false, archived_at: null, archived_reason: null, status: "approved", on_hold_since: null })
      .eq("id", id)
      .select("*, client:clients(name)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action === "update_closure_tat") {
    const days = Number(body.closure_tat_days);
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: "Target closure days must be a positive number." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("requisitions")
      .update({ closure_tat_days: Math.round(days) })
      .eq("id", id)
      .select("*, client:clients(name)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action === "update_details") {
    const update: Record<string, unknown> = {};
    if ("urgency" in body) {
      if (!REQUISITION_URGENCY_ORDER.includes(body.urgency)) {
        return NextResponse.json({ error: "Invalid urgency." }, { status: 400 });
      }
      update.urgency = body.urgency;
    }
    if ("description" in body) {
      update.description = typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if ("custom_fields" in body) {
      const { data: fieldDefs } = await supabase
        .from("custom_field_definitions")
        .select("*")
        .eq("entity_type", "requisition");
      const result = validateCustomFieldValues((fieldDefs as CustomFieldDefinition[]) ?? [], body.custom_fields);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      update.custom_fields = result.cleaned;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("requisitions")
      .update(update)
      .eq("id", id)
      .select("*, client:clients(name)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action !== "set_status") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const status = body.status as RequisitionStatus;
  if (!REQUISITION_STATUS_ORDER.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // Approved/Fulfilled/On Hold/Expired are all HR Management actions per
  // PRD §10 — approval itself, plus everything archive-adjacent (or, for On
  // Hold, starting the archive clock). Raised stays open to any recruiter.
  const restrictedStatuses: RequisitionStatus[] = ["approved", "fulfilled", "on_hold", "expired"];
  if (restrictedStatuses.includes(status) && session.role !== "hr_management") {
    return NextResponse.json(
      { error: `Only HR Management can move a requisition to ${status.replace(/_/g, " ")}.` },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  if (typeof body.note === "string") update.status_note = body.note.trim() || null;

  const enteringApproved = status === "approved" && existing.status !== "approved";
  if (enteringApproved) {
    update.approved_at = now;
    update.approved_by = session.name;
  }

  if (status === "on_hold" && existing.status !== "on_hold") {
    update.on_hold_since = now;
  } else if (status !== "on_hold" && existing.on_hold_since) {
    update.on_hold_since = null;
  }

  // Fulfilled/Expired archive the position immediately — and every one of
  // its candidates, in any stage, so the Kanban stays clean for the next
  // requisition (explicit instruction: no stage/priority filtering).
  const archiving = (status === "fulfilled" || status === "expired") && !existing.archived;
  if (archiving) {
    update.archived = true;
    update.archived_at = now;
    update.archived_reason = status;
  }

  const { data, error } = await supabase
    .from("requisitions")
    .update(update)
    .eq("id", id)
    .select("*, client:clients(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (archiving) {
    await supabase
      .from("candidates")
      .update({
        archived: true,
        archived_at: now,
        archived_reason: status === "fulfilled" ? "requisition_fulfilled" : "requisition_expired",
      })
      .eq("requisition_id", id)
      .eq("archived", false);
  }

  if (enteringApproved) {
    const { data: orgRow } = await supabase.from("org_settings").select("*").eq("id", "default").single();
    const org = (orgRow as OrgSettings) ?? EMPTY_ORG_SETTINGS;
    await insertNotifications(supabase, [requisitionApprovedNotification(data as Requisition)], (data as Requisition).id, null, org);
  }

  return NextResponse.json(data);
}
