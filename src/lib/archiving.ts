import { SupabaseClient } from "@supabase/supabase-js";
import { Requisition } from "./types";

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
