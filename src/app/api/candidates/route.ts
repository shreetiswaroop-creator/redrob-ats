import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { defaultOfferSteps } from "@/lib/types";
import { appendAudit } from "@/lib/audit";

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

  const candidateTrack = body.candidate_track ?? requisition.position_type;
  const offerSteps = defaultOfferSteps().map((step) =>
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
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
