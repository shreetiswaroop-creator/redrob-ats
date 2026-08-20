import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

// The actual security boundary for this role — selects ONLY the confirmed
// whitelist at the query level (never `*` then filter after, which would
// still ship the full row over the network even if the UI hid the rest).
// Explicitly excluded, on purpose, forever: current_ctc, expected_ctc,
// notice_period, personal_email, phone, source, current_location,
// candidate_track, priority, on_hold*, employment_history, reference_records,
// offer_steps, final_*, or anything else not named below.
const WHITELIST_COLUMNS =
  "id, candidate_code, name, requisition_id, current_stage, resume_filename, relevant_experience_years, portfolio_url, linkedin_url, reason_for_change, candidate_notes, requisition:requisitions!inner(title, req_code, hiring_manager_email)";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hiring_manager") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("candidates")
    .select(WHITELIST_COLUMNS)
    .eq("current_stage", "screening")
    .eq("status", "active")
    .eq("archived", false)
    .ilike("requisition.hiring_manager_email", session.email)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
