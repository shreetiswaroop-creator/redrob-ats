import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate, CandidateSource, defaultOfferSteps, PositionType, Requisition, Stage } from "@/lib/types";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const DEMO_REQUISITIONS: Array<{
  title: string;
  department: string;
  location: string;
  position_type: PositionType;
  hiring_manager: string;
  status: "approved" | "on_hold";
  raisedDaysAgo: number;
}> = [
  { title: "Senior Backend Engineer", department: "Engineering", location: "Bengaluru", position_type: "experienced", hiring_manager: "Rahul Mehta", status: "approved", raisedDaysAgo: 12 },
  { title: "Product Designer", department: "Design", location: "Remote", position_type: "experienced", hiring_manager: "Ananya Rao", status: "approved", raisedDaysAgo: 45 },
  { title: "Sales Development Representative", department: "Sales", location: "Mumbai", position_type: "experienced", hiring_manager: "Vikram Shah", status: "on_hold", raisedDaysAgo: 20 },
  { title: "Data Analyst Intern", department: "Data", location: "Pune", position_type: "fresher_intern", hiring_manager: "Priya Nair", status: "approved", raisedDaysAgo: 8 },
];

interface DemoCandidateSpec {
  name: string;
  reqIndex: number;
  track: PositionType;
  stage: Stage;
  status: "active" | "rejected";
  source: CandidateSource;
  priority: "P1" | "P2" | "P3" | null;
  noticePeriod: string | null;
  currentCtc: string | null;
  expectedCtc: string | null;
  location: string;
  relevantExperienceYears: number | null;
  stageEnteredDaysAgo: number;
  offerAcceptedDaysAgo: number | null;
  rejectedFromStage: Stage | null;
}

const DEMO_CANDIDATES: DemoCandidateSpec[] = [
  { name: "[DEMO] Aisha Khan", reqIndex: 0, track: "experienced", stage: "sourcing", status: "active", source: "linkedin", priority: "P2", noticePeriod: "30 days", currentCtc: "18 LPA", expectedCtc: "24 LPA", location: "Bengaluru", relevantExperienceYears: 4, stageEnteredDaysAgo: 2, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Rohan Verma", reqIndex: 0, track: "experienced", stage: "sourcing", status: "active", source: "naukri", priority: null, noticePeriod: "60 days", currentCtc: "15 LPA", expectedCtc: "20 LPA", location: "Hyderabad", relevantExperienceYears: 3, stageEnteredDaysAgo: 1, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Neha Kapoor", reqIndex: 1, track: "experienced", stage: "screening", status: "active", source: "inbound", priority: "P3", noticePeriod: "15 days", currentCtc: "12 LPA", expectedCtc: "16 LPA", location: "Remote", relevantExperienceYears: 5, stageEnteredDaysAgo: 4, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Arjun Singh", reqIndex: 2, track: "experienced", stage: "screening", status: "active", source: "internal_referral", priority: "P1", noticePeriod: "Immediate", currentCtc: "8 LPA", expectedCtc: "11 LPA", location: "Mumbai", relevantExperienceYears: 2, stageEnteredDaysAgo: 3, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Priyanka Das", reqIndex: 0, track: "experienced", stage: "interview", status: "active", source: "linkedin", priority: "P1", noticePeriod: "30 days", currentCtc: "22 LPA", expectedCtc: "28 LPA", location: "Bengaluru", relevantExperienceYears: 6, stageEnteredDaysAgo: 5, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Karan Malhotra", reqIndex: 3, track: "fresher_intern", stage: "interview", status: "active", source: "other", priority: null, noticePeriod: null, currentCtc: null, expectedCtc: "6 LPA", location: "Pune", relevantExperienceYears: 0, stageEnteredDaysAgo: 2, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Simran Kaur", reqIndex: 1, track: "experienced", stage: "selected_awaiting_final_details", status: "active", source: "naukri", priority: "P2", noticePeriod: "45 days", currentCtc: "16 LPA", expectedCtc: "21 LPA", location: "Delhi", relevantExperienceYears: 4, stageEnteredDaysAgo: 3, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Vivek Iyer", reqIndex: 0, track: "experienced", stage: "offer_process", status: "active", source: "inbound", priority: "P1", noticePeriod: "30 days", currentCtc: "20 LPA", expectedCtc: "26 LPA", location: "Chennai", relevantExperienceYears: 5, stageEnteredDaysAgo: 6, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Fatima Sheikh", reqIndex: 3, track: "fresher_intern", stage: "offer_process", status: "active", source: "internal_referral", priority: "P3", noticePeriod: null, currentCtc: null, expectedCtc: "5.5 LPA", location: "Pune", relevantExperienceYears: 0.5, stageEnteredDaysAgo: 4, offerAcceptedDaysAgo: null, rejectedFromStage: null },
  { name: "[DEMO] Aditya Bhatt", reqIndex: 0, track: "experienced", stage: "offer_accepted_completed", status: "active", source: "linkedin", priority: "P1", noticePeriod: "30 days", currentCtc: "19 LPA", expectedCtc: "25 LPA", location: "Bengaluru", relevantExperienceYears: 4, stageEnteredDaysAgo: 7, offerAcceptedDaysAgo: 7, rejectedFromStage: null },
  { name: "[DEMO] Meera Pillai", reqIndex: 1, track: "experienced", stage: "handover_to_hrms", status: "active", source: "naukri", priority: "P2", noticePeriod: "60 days", currentCtc: "14 LPA", expectedCtc: "18 LPA", location: "Remote", relevantExperienceYears: 3, stageEnteredDaysAgo: 2, offerAcceptedDaysAgo: 20, rejectedFromStage: null },
  { name: "[DEMO] Sanjay Gupta", reqIndex: 2, track: "experienced", stage: "screening", status: "rejected", source: "other", priority: null, noticePeriod: null, currentCtc: "9 LPA", expectedCtc: "13 LPA", location: "Mumbai", relevantExperienceYears: 2, stageEnteredDaysAgo: 10, offerAcceptedDaysAgo: null, rejectedFromStage: "screening" },
  { name: "[DEMO] Divya Menon", reqIndex: 0, track: "experienced", stage: "interview", status: "rejected", source: "inbound", priority: null, noticePeriod: null, currentCtc: "17 LPA", expectedCtc: "23 LPA", location: "Bengaluru", relevantExperienceYears: 4, stageEnteredDaysAgo: 15, offerAcceptedDaysAgo: null, rejectedFromStage: "interview" },
];

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can seed demo data." }, { status: 403 });
  }

  const supabase = supabaseServer();

  const { data: insertedReqs, error: reqError } = await supabase
    .from("requisitions")
    .insert(
      DEMO_REQUISITIONS.map((r) => ({
        title: r.title,
        department: r.department,
        location: r.location,
        position_type: r.position_type,
        hiring_manager: r.hiring_manager,
        status: r.status,
        is_demo: true,
        created_at: daysAgo(r.raisedDaysAgo),
        ...(r.status === "approved" ? { approved_at: daysAgo(Math.max(0, r.raisedDaysAgo - 1)), approved_by: session.name } : {}),
      }))
    )
    .select();

  if (reqError || !insertedReqs) {
    return NextResponse.json({ error: reqError?.message ?? "Failed to seed demo requisitions." }, { status: 500 });
  }
  const requisitions = insertedReqs as Requisition[];

  const candidateRows = DEMO_CANDIDATES.map((c) => {
    const requisition = requisitions[c.reqIndex];
    const offerSteps = defaultOfferSteps().map((step) =>
      step.step_number === 4 && c.track === "fresher_intern" ? { ...step, status: "na" as const } : step
    );
    return {
      requisition_id: requisition.id,
      name: c.name,
      current_location: c.location,
      owner: session.name,
      owner_email: session.email,
      candidate_track: c.track,
      hiring_manager: requisition.hiring_manager,
      current_stage: c.status === "rejected" ? (c.rejectedFromStage as Stage) : c.stage,
      stage_entered_at: daysAgo(c.stageEnteredDaysAgo),
      status: c.status,
      rejected_from_stage: c.rejectedFromStage,
      rejection_reason: c.status === "rejected" ? "Demo data — not a strong fit for this role." : null,
      rejected_at: c.status === "rejected" ? daysAgo(Math.max(0, c.stageEnteredDaysAgo - 1)) : null,
      source: c.source,
      priority: c.priority,
      notice_period: c.noticePeriod,
      current_ctc: c.currentCtc,
      expected_ctc: c.expectedCtc,
      relevant_experience_years: c.relevantExperienceYears,
      offer_steps: offerSteps,
      offer_accepted_at: c.offerAcceptedDaysAgo !== null ? daysAgo(c.offerAcceptedDaysAgo) : null,
      is_demo: true,
      audit_log: appendAudit([], "System", "Seeded as demo data"),
    };
  });

  const { data: insertedCandidates, error: candError } = await supabase.from("candidates").insert(candidateRows).select();

  if (candError) {
    // Best-effort rollback of the requisitions we just created.
    await supabase.from("requisitions").delete().in("id", requisitions.map((r) => r.id));
    return NextResponse.json({ error: candError.message }, { status: 500 });
  }

  return NextResponse.json({
    requisitionsCreated: requisitions.length,
    candidatesCreated: (insertedCandidates as Candidate[]).length,
  });
}
