import { SupabaseClient } from "@supabase/supabase-js";
import { Candidate, Requisition } from "./types";

const ON_HOLD_ARCHIVE_MS = 15 * 24 * 60 * 60 * 1000;

// There's no background job in this app, so this runs opportunistically
// whenever the pipeline board loads (same pattern as sweepStepTatBreaches
// in notifications.ts) — a requisition left On Hold for 15+ days archives
// itself, and every one of its candidates regardless of stage, to keep the
// Kanban clean. "Revoke" (requisitions/[id] PATCH) undoes both.
export async function sweepOnHoldArchiving(supabase: SupabaseClient, requisitions: Requisition[]): Promise<void> {
  for (const req of requisitions) {
    if (req.status !== "on_hold" || req.archived || !req.on_hold_since) continue;
    if (Date.now() - new Date(req.on_hold_since).getTime() < ON_HOLD_ARCHIVE_MS) continue;

    const archivedAt = new Date().toISOString();
    await supabase
      .from("requisitions")
      .update({ archived: true, archived_at: archivedAt, archived_reason: "on_hold_timeout" })
      .eq("id", req.id);
    await supabase
      .from("candidates")
      .update({ archived: true, archived_at: archivedAt, archived_reason: "requisition_on_hold" })
      .eq("requisition_id", req.id)
      .eq("archived", false);
  }
}

// Mirrors sweepOnHoldArchiving at the individual candidate level — a
// candidate can be put on hold on their own (set_on_hold), independent of
// their requisition's status. Left on hold 15+ days, they archive with a
// distinct reason so Revoke (candidates/[id] PATCH) knows to restore them
// to their exact prior stage/requisition rather than offering a position
// picker, same as requisition_on_hold candidates.
export async function sweepCandidateOnHoldArchiving(supabase: SupabaseClient, candidates: Candidate[]): Promise<void> {
  for (const c of candidates) {
    if (!c.on_hold || c.archived || !c.on_hold_since) continue;
    if (Date.now() - new Date(c.on_hold_since).getTime() < ON_HOLD_ARCHIVE_MS) continue;

    await supabase
      .from("candidates")
      .update({ archived: true, archived_at: new Date().toISOString(), archived_reason: "candidate_on_hold_timeout" })
      .eq("id", c.id)
      .eq("archived", false);
  }
}
