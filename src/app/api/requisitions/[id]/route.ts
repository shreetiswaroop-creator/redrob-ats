import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { Candidate, CustomFieldDefinition, OrgSettings, Requisition, REQUISITION_STATUS_ORDER, REQUISITION_URGENCY_ORDER, RequisitionStatus } from "@/lib/types";
import { EMPTY_ORG_SETTINGS, fetchEmailTemplates, insertNotifications, positionReopenedNotification, requisitionApprovedNotification } from "@/lib/notifications";
import { validateCustomFieldValues } from "@/lib/customFields";
import { appendAudit } from "@/lib/audit";

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
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("requisitions")
      .update({ archived: false, archived_at: null, archived_reason: null, status: "approved", on_hold_since: null })
      .eq("id", id)
      .select("*, client:clients(name)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const requisition = data as Requisition;

    // Cascade to every candidate archived specifically because THIS
    // requisition went on hold (sweepOnHoldArchiving in src/lib/archiving.ts)
    // — never candidates archived for any other reason (e.g. individually
    // rejected-and-archived). Restore to their exact prior stage, not
    // Sourcing: the sweep only ever flipped the archived flag, it never
    // touched current_stage, so this is purely clearing that flag — contrast
    // with the individual candidate-level "revoke" action, which deliberately
    // does reset to Sourcing since that's a fresh reconsideration, not an
    // interrupted-then-resumed pipeline.
    const { data: affectedCandidates } = await supabase
      .from("candidates")
      .select("*")
      .eq("requisition_id", id)
      .eq("archived", true)
      .eq("archived_reason", "requisition_on_hold");

    if (affectedCandidates && affectedCandidates.length > 0) {
      const [{ data: orgRow }, templates] = await Promise.all([
        supabase.from("org_settings").select("*").eq("id", "default").single(),
        fetchEmailTemplates(supabase),
      ]);
      const org = (orgRow as OrgSettings) ?? EMPTY_ORG_SETTINGS;

      for (const candidate of affectedCandidates as Candidate[]) {
        const { error: candError } = await supabase
          .from("candidates")
          .update({
            archived: false,
            archived_at: null,
            archived_reason: null,
            stage_entered_at: now,
            audit_log: appendAudit(candidate.audit_log, session.name, "Position reopened", "Restored from archive — requisition came off hold"),
          })
          .eq("id", candidate.id);
        // Best-effort per candidate, matching the rest of the app's
        // convention (e.g. reference-check document sends) — one row
        // failing shouldn't block the requisition revoke or the other
        // candidates from being restored and notified.
        if (candError) {
          console.warn(`[requisitions revoke] Failed to restore candidate ${candidate.id}: ${candError.message}`);
          continue;
        }
        const draft = positionReopenedNotification(candidate, requisition, templates);
        await insertNotifications(supabase, [draft], requisition.id, candidate.id, org);
      }
    }

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
    // No status-based lock, deliberately — a requisition being Approved (or
    // any other status) never freezes it against edits. This action started
    // as a narrow urgency/description/custom_fields patch (edited straight
    // from the Kanban card) and is widened here to the full field set,
    // reachable from the Requisitions page's edit form — same action,
    // whichever caller sends fewer or more fields.
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
    if ("title" in body) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "Role title is required." }, { status: 400 });
      }
      update.title = body.title.trim();
    }
    if ("client_id" in body) {
      if (typeof body.client_id !== "string" || !body.client_id) {
        return NextResponse.json({ error: "Client is required." }, { status: 400 });
      }
      update.client_id = body.client_id;
    }
    if ("hiring_manager" in body) {
      if (typeof body.hiring_manager !== "string" || !body.hiring_manager.trim()) {
        return NextResponse.json({ error: "Hiring Manager is required." }, { status: 400 });
      }
      update.hiring_manager = body.hiring_manager.trim();
    }
    if ("hiring_manager_email" in body) {
      // This field drives real access control (the hiring_manager role's
      // entire visibility is scoped by matching it) — changing who it points
      // at is an HR Management action, not a plain field edit anyone raising
      // requisitions can make.
      if (session.role !== "hr_management") {
        return NextResponse.json({ error: "Only HR Management can change the assigned Hiring Manager's email." }, { status: 403 });
      }
      update.hiring_manager_email = typeof body.hiring_manager_email === "string" ? body.hiring_manager_email.trim() || null : null;
    }
    if ("position_type" in body) {
      if (body.position_type !== "experienced" && body.position_type !== "fresher_intern") {
        return NextResponse.json({ error: "Invalid position type." }, { status: 400 });
      }
      update.position_type = body.position_type;
    }
    if ("headcount" in body) {
      const headcount = Number(body.headcount);
      if (!Number.isFinite(headcount) || headcount <= 0) {
        return NextResponse.json({ error: "Headcount must be a positive number." }, { status: 400 });
      }
      update.headcount = Math.round(headcount);
    }
    if ("department" in body) {
      update.department = typeof body.department === "string" ? body.department.trim() || null : null;
    }
    if ("level" in body) {
      update.level = typeof body.level === "string" ? body.level.trim() || null : null;
    }
    if ("location" in body) {
      update.location = typeof body.location === "string" ? body.location.trim() || null : null;
    }
    if ("budget_band" in body) {
      update.budget_band = typeof body.budget_band === "string" ? body.budget_band.trim() || null : null;
    }
    if ("must_have_skills" in body) {
      update.must_have_skills = typeof body.must_have_skills === "string" ? body.must_have_skills.trim() || null : null;
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
