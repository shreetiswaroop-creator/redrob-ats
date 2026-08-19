import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { CustomFieldDefinition, defaultOfferSteps } from "@/lib/types";
import { appendAudit } from "@/lib/audit";
import { validateCustomFieldValues } from "@/lib/customFields";

export async function GET(req: NextRequest) {
  const requisitionId = req.nextUrl.searchParams.get("requisition_id");
  const supabase = supabaseServer();

  let query = supabase.from("candidates").select("*").order("created_at", { ascending: false });
  if (requisitionId) query = query.eq("requisition_id", requisitionId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();

  const required = ["requisition_id", "name"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const supabase = supabaseServer();

  const { data: requisition, error: reqError } = await supabase
    .from("requisitions")
    .select("*")
    .eq("id", body.requisition_id)
    .single();

  if (reqError || !requisition) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }

  // Warn (don't block) when this phone/email already exists anywhere in the
  // database — a recruiter can knowingly proceed (e.g. a legitimate
  // reapplication to a different role) by resubmitting with
  // confirm_duplicate: true.
  if (!body.confirm_duplicate && (body.phone || body.personal_email)) {
    const dupeCols =
      "id, candidate_code, name, requisition_id, current_stage, status, rejection_reason, on_hold, on_hold_note, archived, archived_reason, created_at";
    const dupeRows: Record<string, unknown>[] = [];
    if (body.phone) {
      const { data } = await supabase.from("candidates").select(dupeCols).eq("phone", body.phone);
      if (data) dupeRows.push(...data);
    }
    if (body.personal_email) {
      const { data } = await supabase.from("candidates").select(dupeCols).eq("personal_email", body.personal_email);
      if (data) dupeRows.push(...data);
    }
    const dupes = Array.from(new Map(dupeRows.map((d) => [d.id as string, d])).values());

    if (dupes.length > 0) {
      const reqIds = Array.from(new Set(dupes.map((d) => d.requisition_id as string)));
      const { data: reqRows } = await supabase.from("requisitions").select("id, req_code, title").in("id", reqIds);
      const reqById = new Map((reqRows ?? []).map((r) => [r.id, r]));

      const matches = dupes.map((d) => {
        const req = reqById.get(d.requisition_id as string);
        return {
          id: d.id,
          candidate_code: d.candidate_code,
          name: d.name,
          requisition_id: d.requisition_id,
          requisition_title: req?.title ?? null,
          req_code: req?.req_code ?? null,
          shortlisted_on: d.created_at,
          stage: d.current_stage,
          status: d.status,
          rejection_reason: d.rejection_reason,
          on_hold: d.on_hold,
          on_hold_note: d.on_hold_note,
          archived: d.archived,
          archived_reason: d.archived_reason,
        };
      });

      return NextResponse.json({ error: "duplicate", duplicate: true, matches }, { status: 409 });
    }
  }

  const { data: fieldDefs } = await supabase
    .from("custom_field_definitions")
    .select("*")
    .eq("entity_type", "candidate");
  const customFieldsResult = validateCustomFieldValues((fieldDefs as CustomFieldDefinition[]) ?? [], body.custom_fields);
  if (!customFieldsResult.ok) {
    return NextResponse.json({ error: customFieldsResult.error }, { status: 400 });
  }

  const { data: orgRow } = await supabase.from("org_settings").select("default_step_tat_hours").eq("id", "default").single();

  const candidateTrack = body.candidate_track ?? requisition.position_type;
  const offerSteps = defaultOfferSteps(orgRow?.default_step_tat_hours).map((step) =>
    step.step_number === 4 && candidateTrack === "fresher_intern"
      ? { ...step, status: "na" as const }
      : step
  );

  const auditLog = appendAudit([], session.name, "Candidate added at Sourcing");

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      requisition_id: body.requisition_id,
      name: body.name,
      phone: body.phone ?? null,
      personal_email: body.personal_email ?? null,
      // Candidate Owner is tagged automatically from whoever is logged in
      // when they add the candidate (PRD 5.1), not manually typed.
      owner: session.name,
      owner_email: session.email,
      candidate_track: candidateTrack,
      track_override_reason:
        body.candidate_track && body.candidate_track !== requisition.position_type
          ? body.track_override_reason ?? null
          : null,
      hiring_manager: body.hiring_manager ?? requisition.hiring_manager,
      offer_steps: offerSteps,
      audit_log: auditLog,
      notice_period: body.notice_period || null,
      current_ctc: body.current_ctc || null,
      expected_ctc: body.expected_ctc || null,
      current_location: body.current_location || null,
      source: body.source || null,
      relevant_experience_years: body.relevant_experience_years ?? null,
      notes: body.notes || null,
      linkedin_url: body.linkedin_url || null,
      portfolio_url: body.portfolio_url || null,
      reason_for_change: body.reason_for_change || null,
      consent_given: !!body.consent_given,
      consent_given_at: body.consent_given ? new Date().toISOString() : null,
      custom_fields: customFieldsResult.cleaned,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
