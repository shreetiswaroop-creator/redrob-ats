import { SupabaseClient } from "@supabase/supabase-js";
import {
  Candidate,
  Requisition,
  OrgSettings,
  NotificationRecipient,
  OfferStep,
  OfferDocumentApprovals,
  STAGE_LABELS,
  Stage,
} from "./types";
import { appendAudit } from "./audit";
import { computeStepTatStatus } from "./tat";

export interface NotificationDraft {
  trigger_event: string;
  recipients: NotificationRecipient[];
  subject: string;
  body: string;
  isCorrection?: boolean; // true for "please disregard our previous message" emails — never delayed further
}

export const PENDING_WINDOW_MS = 60 * 60 * 1000; // 60 minutes, per the send-delay buffer

export function isCandidateFacing(draft: NotificationDraft): boolean {
  return draft.recipients.some((r) => r.role === "Candidate");
}

function recipient(role: string, name: string | null | undefined, email: string | null | undefined): NotificationRecipient {
  return { role, name: name ?? null, email: email ?? null };
}

export const EMPTY_ORG_SETTINGS: OrgSettings = {
  id: "default",
  hr_management_emails: null,
  common_hr_mailbox_name: null,
  common_hr_mailbox_email: null,
  hrms_team_email: null,
  common_hr_gmail_connected_at: null,
};

export function candidateRecipient(c: Candidate) {
  return recipient("Candidate", c.name, c.personal_email);
}
export function hiringManagerRecipient(req: Requisition) {
  return recipient("Hiring Manager", req.hiring_manager, req.hiring_manager_email);
}
export function recruiterRecipient(c: Candidate) {
  return recipient("Recruiter", c.owner, c.owner_email);
}
export function hrManagementRecipient(org: OrgSettings) {
  return recipient("HR Management", null, org.hr_management_emails);
}
export function commonHrMailboxRecipient(org: OrgSettings) {
  return recipient("Common HR Mailbox", org.common_hr_mailbox_name, org.common_hr_mailbox_email);
}
export function hrmsTeamRecipient(org: OrgSettings) {
  return recipient("HRMS Team", null, org.hrms_team_email);
}
export function panelRecipients(c: Candidate): NotificationRecipient[] {
  const roundWithPanel = [...c.interview_rounds].reverse().find((rd) => rd.panelist_emails);
  if (!roundWithPanel?.panelist_emails) return [];
  return roundWithPanel.panelist_emails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => recipient("Panel", null, email));
}

export function recipientsSummary(recipients: NotificationRecipient[]): string {
  return recipients
    .map((r) => `${r.role}${r.name ? ` (${r.name})` : ""} <${r.email ?? "no email on file"}>`)
    .join("; ");
}

// --- Event builders (Section 6 notification matrix) ------------------------

export function requisitionApprovedNotification(req: Requisition): NotificationDraft {
  return {
    trigger_event: "requisition_approved",
    recipients: [hiringManagerRecipient(req)],
    subject: `Requisition ${req.req_code} approved — ${req.title}`,
    body: `Your requisition for ${req.title} (${req.req_code}) has been approved. Sourcing can now begin.`,
  };
}

export function candidateMovedInterviewNotification(c: Candidate, req: Requisition): NotificationDraft {
  return {
    trigger_event: "candidate_moved_interview",
    recipients: [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c), ...panelRecipients(c)],
    subject: `Interview scheduled — ${c.name} (${c.candidate_code})`,
    body: `${c.name} has moved to the Interview Round stage for ${req.title} (${req.req_code}). Interview details to follow.`,
  };
}

export function selectedAwaitingFinalDetailsNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings
): NotificationDraft {
  return {
    trigger_event: "selected_awaiting_final_details",
    recipients: [hiringManagerRecipient(req), hrManagementRecipient(org), recruiterRecipient(c)],
    subject: `Action needed: confirm final offer details — ${c.name}`,
    body: `${c.name} has cleared all interview rounds for ${req.title} (${req.req_code}). Please confirm final compensation, DOJ, designation, and location.`,
  };
}

export function finalDetailsConfirmedNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings
): NotificationDraft {
  return {
    trigger_event: "final_details_confirmed",
    recipients: [recruiterRecipient(c), hiringManagerRecipient(req), hrManagementRecipient(org)],
    subject: `Final details confirmed — Offer Process starting for ${c.name}`,
    body: `Final offer details for ${c.name} (${req.title}) are confirmed: ${c.final_designation}, ${c.final_compensation}, DOJ ${c.final_doj}, ${c.final_location}${
      c.final_benefits ? `, benefits: ${c.final_benefits}` : ""
    }${c.final_notes ? ` (note: ${c.final_notes})` : ""}. The Offer Process is starting.`,
  };
}

export function offerStepNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  step: OfferStep,
  transition: "initiated" | "completed"
): NotificationDraft {
  const recipients: NotificationRecipient[] =
    step.step_number === 1
      ? [candidateRecipient(c), recruiterRecipient(c)]
      : [recruiterRecipient(c), commonHrMailboxRecipient(org)];
  return {
    trigger_event: `offer_step_${step.step_number}_${transition}`,
    recipients,
    subject: `Offer Step ${step.step_number} (${step.step_name}) ${transition} — ${c.name}`,
    body: `Step ${step.step_number}: ${step.step_name} has been ${transition} for ${c.name} (${req.title}, ${c.candidate_code}).`,
  };
}

export function offerAcceptedCompletedNotification(c: Candidate, req: Requisition): NotificationDraft {
  return {
    trigger_event: "offer_accepted_completed",
    recipients: [recruiterRecipient(c), hiringManagerRecipient(req)],
    subject: `Offer accepted — ${c.name} has signed the Employee Agreement`,
    body: `${c.name} (${c.candidate_code}) has signed and returned the Employee Agreement for ${req.title}. All 5 offer steps are complete.`,
  };
}

export function handoverToHrmsNotification(c: Candidate, req: Requisition, org: OrgSettings): NotificationDraft {
  return {
    trigger_event: "handover_to_hrms",
    recipients: [hrmsTeamRecipient(org), recruiterRecipient(c), hrManagementRecipient(org)],
    subject: `Candidate handover — ${c.name} (${c.candidate_code})`,
    body: `${c.name}'s record and documents for ${req.title} (${req.req_code}) have been handed over to HRMS for onboarding.`,
  };
}

export function genericStageMovedNotification(c: Candidate, req: Requisition, toStage: Stage): NotificationDraft {
  return {
    trigger_event: "candidate_moved_generic",
    recipients: [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)],
    subject: `Candidature status updated — ${c.name}`,
    body: `${c.name}'s candidature for ${req.title} is now in the "${STAGE_LABELS[toStage]}" stage.`,
  };
}

export function rejectedNotification(c: Candidate, req: Requisition, reason: string): NotificationDraft {
  return {
    trigger_event: "candidate_rejected",
    recipients: [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)],
    subject: `Update on your application — ${req.title}`,
    body: `Thank you for your interest in ${req.title}. After careful consideration, we will not be moving forward at this time.\n\n(Internal note — reason: ${reason})`,
  };
}

// Rejection → Restore correction: only used when the original rejection
// email already sent (if it was still pending, we just cancel it — no email
// needed at all).
export function rejectionDisregardNotification(c: Candidate, req: Requisition): NotificationDraft {
  return {
    trigger_event: "candidate_rejected_disregard",
    recipients: [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)],
    subject: `Please disregard our previous message — ${req.title}`,
    body: `Please disregard our previous message about your application for ${req.title}. Your application is active and under review — we apologize for the confusion.`,
    isCorrection: true,
  };
}

type DocEvent = "draft_uploaded" | "changes_requested" | "approved" | "signed";

export function offerDocumentNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  docType: "offer_letter" | "employee_agreement",
  event: DocEvent
): NotificationDraft {
  const label = docType === "offer_letter" ? "Offer Letter" : "Employee Agreement";
  let recipients: NotificationRecipient[];
  let subject: string;
  switch (event) {
    case "draft_uploaded":
      recipients = [hrManagementRecipient(org)];
      subject = `${label} draft ready for review — ${c.name}`;
      break;
    case "changes_requested":
      recipients = [recruiterRecipient(c)];
      subject = `Changes requested on ${label} — ${c.name}`;
      break;
    case "approved":
      recipients = [candidateRecipient(c), recruiterRecipient(c)];
      subject = `${label} approved and sent to ${c.name}`;
      break;
    case "signed":
      recipients = [candidateRecipient(c), recruiterRecipient(c)];
      subject = `${label} e-signed and sent to ${c.name}`;
      break;
  }
  return {
    trigger_event: `${docType}_${event}`,
    recipients,
    subject,
    body: `${subject} (${req.title}, ${c.candidate_code}).`,
  };
}

export function tatNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  status: "at_risk" | "breached"
): NotificationDraft {
  const label = status === "at_risk" ? "at risk" : "breached";
  return {
    trigger_event: `tat_${status}`,
    recipients: [recruiterRecipient(c), hrManagementRecipient(org)],
    subject: `TAT ${label} — ${c.name}`,
    body: `The current stage/step for ${c.name} (${req.title}, ${c.candidate_code}) is TAT ${label}.`,
  };
}

export function stepTatNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  step: OfferStep,
  status: "at_risk" | "breached"
): NotificationDraft {
  const label = status === "at_risk" ? "at risk" : "breached";
  return {
    trigger_event: `step_tat_${status}`,
    recipients: [recruiterRecipient(c), hrManagementRecipient(org)],
    subject: `Step ${step.step_number} (${step.step_name}) TAT ${label} — ${c.name}`,
    body: `Step ${step.step_number}: ${step.step_name} for ${c.name} (${req.title}, ${c.candidate_code}) is TAT ${label}.`,
  };
}

export function graceExtensionApprovedNotification(
  c: Candidate,
  req: Requisition,
  step: OfferStep,
  newTatHours: number
): NotificationDraft {
  return {
    trigger_event: "grace_extension_approved",
    recipients: [recruiterRecipient(c), hiringManagerRecipient(req)],
    subject: `Grace extension approved — Step ${step.step_number} (${step.step_name}) — ${c.name}`,
    body: `The TAT for Step ${step.step_number}: ${step.step_name} has been extended to ${newTatHours}h (from step start) for ${c.name} (${req.title}, ${c.candidate_code}).`,
  };
}

export function referenceExceptionRequestedNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  reason: string
): NotificationDraft {
  return {
    trigger_event: "reference_exception_requested",
    recipients: [hrManagementRecipient(org)],
    subject: `2-reference exception requested — ${c.name}`,
    body: `${c.owner} has requested to proceed with only 2 references for ${c.name} (${req.title}, ${c.candidate_code}). Reason: ${reason}`,
  };
}

export function referenceExceptionApprovedNotification(c: Candidate, req: Requisition): NotificationDraft {
  return {
    trigger_event: "reference_exception_approved",
    recipients: [recruiterRecipient(c)],
    subject: `2-reference exception approved — ${c.name}`,
    body: `The 2-reference exception for ${c.name} (${req.title}, ${c.candidate_code}) has been approved. Step 2 can proceed/complete on 2 references.`,
  };
}

// --- Diff detection ----------------------------------------------------

export function detectOfferStepTransitions(
  oldSteps: OfferStep[],
  newSteps: OfferStep[]
): Array<{ step: OfferStep; transition: "initiated" | "completed" }> {
  const results: Array<{ step: OfferStep; transition: "initiated" | "completed" }> = [];
  for (const newStep of newSteps) {
    if (newStep.step_number !== 1 && newStep.step_number !== 2 && newStep.step_number !== 4) continue;
    const oldStep = oldSteps.find((s) => s.step_number === newStep.step_number);
    if (!oldStep) continue;
    if (oldStep.status !== "in_progress" && newStep.status === "in_progress") {
      results.push({ step: newStep, transition: "initiated" });
    }
    if (oldStep.status !== "complete" && newStep.status === "complete") {
      results.push({ step: newStep, transition: "completed" });
    }
  }
  return results;
}

export function detectStep5Completed(oldSteps: OfferStep[], newSteps: OfferStep[]): boolean {
  const oldStep5 = oldSteps.find((s) => s.step_number === 5);
  const newStep5 = newSteps.find((s) => s.step_number === 5);
  return !!newStep5 && newStep5.status === "complete" && oldStep5?.status !== "complete";
}

export function detectDocumentApprovalEvents(
  oldApprovals: OfferDocumentApprovals,
  newApprovals: OfferDocumentApprovals
): Array<{ docType: "offer_letter" | "employee_agreement"; event: DocEvent }> {
  const results: Array<{ docType: "offer_letter" | "employee_agreement"; event: DocEvent }> = [];
  (["offer_letter", "employee_agreement"] as const).forEach((docType) => {
    const oldDoc = oldApprovals[docType];
    const newDoc = newApprovals[docType];
    if (!newDoc) return;
    if ((!oldDoc || oldDoc.version !== newDoc.version) && newDoc.version && newDoc.review_status === "pending") {
      results.push({ docType, event: "draft_uploaded" });
    }
    if (oldDoc?.review_status !== "changes_requested" && newDoc.review_status === "changes_requested") {
      results.push({ docType, event: "changes_requested" });
    }
    if (oldDoc?.review_status !== "approved" && newDoc.review_status === "approved") {
      results.push({ docType, event: "approved" });
    }
    if (docType === "employee_agreement" && oldDoc?.signature_status !== "signed" && newDoc.signature_status === "signed") {
      results.push({ docType, event: "signed" });
    }
  });
  return results;
}

export function detectTatTransition(oldStatus: string, newStatus: string): "at_risk" | "breached" | null {
  if (oldStatus === newStatus) return null;
  if (newStatus === "at_risk" || newStatus === "breached") return newStatus;
  return null;
}

// --- Persistence ---------------------------------------------------------

export interface InsertedNotification {
  draft: NotificationDraft;
  pending: boolean; // true = queued for send-delay, false = logged/sent immediately
}

// Candidate-facing drafts (and only those — internal-only notifications have
// no reason to wait) go into the queue for 60 minutes instead of being
// logged immediately, so a mistake can still be caught. Correction emails
// ("please disregard...") skip the queue — they're urgent by nature.
export async function insertNotifications(
  supabase: SupabaseClient,
  drafts: NotificationDraft[],
  requisitionId: string | null,
  candidateId: string | null
): Promise<InsertedNotification[]> {
  if (drafts.length === 0) return [];
  const now = new Date();
  const rows = drafts.map((d) => {
    const delayed = !d.isCorrection && isCandidateFacing(d);
    return {
      trigger_event: d.trigger_event,
      requisition_id: requisitionId,
      candidate_id: candidateId,
      recipients: d.recipients,
      subject: d.subject,
      body: d.body,
      status: delayed ? ("pending" as const) : ("sent" as const),
      scheduled_send_at: delayed ? new Date(now.getTime() + PENDING_WINDOW_MS).toISOString() : now.toISOString(),
      sent_at: delayed ? null : now.toISOString(),
      is_correction: d.isCorrection ?? false,
    };
  });
  await supabase.from("notifications").insert(rows);
  return drafts.map((draft, i) => ({ draft, pending: rows[i].status === "pending" }));
}

// There's no background job in this app, so per-step TAT breaches can't be
// caught the instant they happen. Instead, this runs whenever someone loads
// the board (the natural "someone is watching" moment) — it recomputes each
// in-progress step's TAT status and logs a notification the first time a
// step crosses into at-risk or breached, tracked via last_notified_tat_status
// so the same crossing doesn't get logged again on every subsequent load.
export async function sweepStepTatBreaches(
  supabase: SupabaseClient,
  candidates: Candidate[],
  requisitionById: Map<string, Requisition>,
  org: OrgSettings
): Promise<void> {
  for (const candidate of candidates) {
    if (candidate.status !== "active") continue;
    const requisition = requisitionById.get(candidate.requisition_id);
    if (!requisition) continue;

    const drafts: NotificationDraft[] = [];
    let auditLog = candidate.audit_log;
    let changed = false;

    const updatedSteps = candidate.offer_steps.map((step) => {
      if (step.status !== "in_progress") return step;
      const computed = computeStepTatStatus(step);
      if ((computed === "at_risk" || computed === "breached") && step.last_notified_tat_status !== computed) {
        const draft = stepTatNotification(candidate, requisition, org, step, computed);
        drafts.push(draft);
        auditLog = appendAudit(auditLog, "System", "Notification logged", `${draft.subject} → ${recipientsSummary(draft.recipients)}`);
        changed = true;
        return { ...step, last_notified_tat_status: computed };
      }
      return step;
    });

    if (changed) {
      await supabase.from("candidates").update({ offer_steps: updatedSteps, audit_log: auditLog }).eq("id", candidate.id);
      await insertNotifications(supabase, drafts, candidate.requisition_id, candidate.id);
    }
  }
}

// --- Send-delay buffer + correction logic ---------------------------------

export type MoveCorrectionResult =
  | { kind: "none" }
  | { kind: "cancelled"; subject: string }
  | { kind: "flagged"; subject: string };

// Called when a candidate is moved to an EARLIER stage than they're
// currently in — a correction of whatever forward move most recently
// happened. If that move's email is still pending, cancel it silently. If
// it already sent, we never auto-send a "never mind" for a generic
// stage-change (only for an undone rejection — see handleRestoreCorrection)
// — instead this flags the card for a human to personally handle.
export async function handleBackwardMoveCorrection(
  supabase: SupabaseClient,
  candidateId: string
): Promise<MoveCorrectionResult> {
  const { data } = await supabase
    .from("notifications")
    .select("id, status, subject")
    .eq("candidate_id", candidateId)
    .in("trigger_event", ["candidate_moved_generic", "candidate_moved_interview"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { kind: "none" };

  if (data.status === "pending") {
    await supabase
      .from("notifications")
      .update({ status: "cancelled", cancel_reason: "Moved back before send" })
      .eq("id", data.id);
    return { kind: "cancelled", subject: data.subject };
  }

  if (data.status === "sent") {
    return { kind: "flagged", subject: data.subject };
  }

  return { kind: "none" };
}

export type RestoreCorrectionResult =
  | { kind: "none" }
  | { kind: "cancelled"; subject: string }
  | { kind: "corrected"; draft: NotificationDraft };

// Called when a rejected candidate is restored to active. If the rejection
// email is still pending, cancel it — nothing ever goes out. If it already
// sent, this is the one case that DOES get an automatic correction email
// ("please disregard...", built by rejectionDisregardNotification), since
// telling someone they were rejected when they weren't needs prompt fixing.
export async function handleRestoreCorrection(
  supabase: SupabaseClient,
  candidate: Candidate,
  requisition: Requisition
): Promise<RestoreCorrectionResult> {
  const { data } = await supabase
    .from("notifications")
    .select("id, status, subject")
    .eq("candidate_id", candidate.id)
    .eq("trigger_event", "candidate_rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { kind: "none" };

  if (data.status === "pending") {
    await supabase
      .from("notifications")
      .update({ status: "cancelled", cancel_reason: "Restored before send" })
      .eq("id", data.id);
    return { kind: "cancelled", subject: data.subject };
  }

  if (data.status === "sent") {
    return { kind: "corrected", draft: rejectionDisregardNotification(candidate, requisition) };
  }

  return { kind: "none" };
}

// Processes every notification whose 60-minute (or immediate) window has
// elapsed. Called both by the secured worker endpoint an external scheduler
// pings every few minutes, AND opportunistically on board page load (same
// belt-and-suspenders pattern as sweepStepTatBreaches) so testing isn't
// blocked on the external scheduler being configured yet.
//
// Gmail sending isn't wired up yet (that's the rest of this phase) — for
// now, "sending" just means resolving the row to 'sent' the same way
// Phase 2-3 always worked (logged, not actually emailed). Once
// resolveSenderAndSend exists, this is the one place that needs to change.
export async function processDuePendingNotifications(supabase: SupabaseClient): Promise<{ processed: number }> {
  const { data: due } = await supabase
    .from("notifications")
    .select("id, candidate_id, subject")
    .eq("status", "pending")
    .lte("scheduled_send_at", new Date().toISOString());

  if (!due || due.length === 0) return { processed: 0 };

  for (const notif of due) {
    await supabase.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", notif.id);

    if (notif.candidate_id) {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("audit_log")
        .eq("id", notif.candidate_id)
        .single();
      if (candidate) {
        const auditLog = appendAudit(candidate.audit_log, "System", "Email sent", notif.subject);
        await supabase.from("candidates").update({ audit_log: auditLog }).eq("id", notif.candidate_id);
      }
    }
  }

  return { processed: due.length };
}
