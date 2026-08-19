import { SupabaseClient } from "@supabase/supabase-js";
import { Candidate } from "./types";
import { appendAudit } from "./audit";

export interface OwnedCandidateSummary {
  id: string;
  candidate_code: string;
  name: string;
  requisition_id: string;
  requisition: { req_code: string; title: string } | null;
}

// "Active" here matches every other "still on the live board" definition
// already used across dashboardMetrics.ts/recruiterMetrics.ts — excludes
// rejected and archived candidates, since those aren't actionable and
// don't need a new owner.
export async function fetchActiveCandidatesOwnedBy(
  supabase: SupabaseClient,
  ownerName: string
): Promise<OwnedCandidateSummary[]> {
  const { data } = await supabase
    .from("candidates")
    .select("id, candidate_code, name, requisition_id, requisition:requisitions(req_code, title)")
    .eq("owner", ownerName)
    .eq("status", "active")
    .eq("archived", false);
  return ((data as unknown as OwnedCandidateSummary[]) ?? []).map((c) => ({
    ...c,
    requisition: Array.isArray(c.requisition) ? c.requisition[0] ?? null : c.requisition,
  }));
}

// The single mechanism both the candidate-level "Reassign owner" action and
// the bulk reassignment that runs during user deactivation call — so there
// is exactly one code path that knows how to move ownership of a candidate,
// not two independently-maintained copies of the same logic.
export async function reassignCandidateOwner(
  supabase: SupabaseClient,
  candidateId: string,
  newOwner: { name: string; email: string },
  actor: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: candidate, error: fetchError } = await supabase
    .from("candidates")
    .select("owner, audit_log")
    .eq("id", candidateId)
    .single();
  if (fetchError || !candidate) return { ok: false, error: `Candidate ${candidateId} not found.` };
  if (candidate.owner === newOwner.name) return { ok: true };

  const { error } = await supabase
    .from("candidates")
    .update({
      owner: newOwner.name,
      owner_email: newOwner.email,
      // Never touches earlier entries — history keeps reading "owned by
      // the old name" exactly as it happened, only this one new entry
      // records the handoff.
      audit_log: appendAudit(
        candidate.audit_log as Candidate["audit_log"],
        actor,
        "Reassigned owner",
        `${candidate.owner || "Unassigned"} → ${newOwner.name}`
      ),
    })
    .eq("id", candidateId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
