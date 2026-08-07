import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate, GraceExtension, OrgSettings, Requisition, STAGE_LABELS, STAGE_ORDER, Stage } from "@/lib/types";
import { normalizeOfferSteps, pendingGraceExtension } from "@/lib/tat";
import {
  EMPTY_ORG_SETTINGS,
  NotificationDraft,
  candidateMovedInterviewNotification,
  detectDocumentApprovalEvents,
  detectOfferStepTransitions,
  detectStep5Completed,
  detectTatTransition,
  finalDetailsConfirmedNotification,
  genericStageMovedNotification,
  graceExtensionApprovedNotification,
  handoverToHrmsNotification,
  handleBackwardMoveCorrection,
  handleRestoreCorrection,
  insertNotifications,
  offerAcceptedCompletedNotification,
  offerDocumentNotification,
  offerStepNotification,
  recipientsSummary,
  referenceExceptionApprovedNotification,
  referenceExceptionRequestedNotification,
  rejectedNotification,
  selectedAwaitingFinalDetailsNotification,
  tatNotification,
} from "@/lib/notifications";

const EDITABLE_FIELDS = [
  "name",
  "phone",
  "personal_email",
  "owner",
  "owner_email",
  "candidate_track",
  "track_override_reason",
  "hiring_manager",
  "current_employer_hr_email",
  "tat_status",
  "priority",
  "notice_period",
  "current_ctc",
  "expected_ctc",
  "current_location",
  "source",
  "relevant_experience_years",
  "notes",
  "interview_rounds",
  "employment_history",
  "reference_records",
  "offer_steps",
  "documents",
  "offer_document_approvals",
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const actor = session.name;

  const { id } = await params;
  const body = await req.json();
  const supabase = supabaseServer();

  const { data: existing, error: fetchError } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }
  const candidate = existing as Candidate;

  const [{ data: requisitionRow }, { data: orgSettingsRow }] = await Promise.all([
    supabase.from("requisitions").select("*").eq("id", candidate.requisition_id).single(),
    supabase.from("org_settings").select("*").eq("id", "default").single(),
  ]);
  const requisition = requisitionRow as Requisition;
  const org: OrgSettings = (orgSettingsRow as OrgSettings) ?? EMPTY_ORG_SETTINGS;

  let update: Record<string, unknown> = {};
  const drafts: NotificationDraft[] = [];

  switch (body.action) {
    case "move_stage": {
      const toStage = body.to_stage as Stage;
      if (!toStage || !STAGE_LABELS[toStage]) {
        return NextResponse.json({ error: "Invalid target stage." }, { status: 400 });
      }
      if (toStage === "offer_process" && !candidate.final_details_locked) {
        return NextResponse.json(
          { error: "Confirm final offer details (compensation, DOJ, designation, location) before moving to Offer Process." },
          { status: 400 }
        );
      }
      update = {
        current_stage: toStage,
        stage_entered_at: new Date().toISOString(),
      };

      const isBackward = STAGE_ORDER.indexOf(toStage) < STAGE_ORDER.indexOf(candidate.current_stage);

      if (isBackward) {
        // A corrected acceptance is no longer an acceptance — clear it so
        // Time to Fill doesn't count a candidate who was moved back out.
        if (candidate.current_stage === "offer_accepted_completed") {
          update.offer_accepted_at = null;
        }
        // A correction of whatever forward move most recently happened —
        // never sends a new "candidature status updated" email for the
        // backward move itself. See handleBackwardMoveCorrection for the
        // cancel-if-pending / flag-if-already-sent split.
        const correction = await handleBackwardMoveCorrection(supabase, candidate.id);
        if (correction.kind === "cancelled") {
          update.audit_log = appendAudit(
            candidate.audit_log,
            "System",
            "Cancelled pending email",
            `"${correction.subject}" — moved back before it sent`
          );
        } else if (correction.kind === "flagged") {
          update.manual_followup_note = `Moved from ${STAGE_LABELS[candidate.current_stage]} back to ${STAGE_LABELS[toStage]} after "${correction.subject}" had already sent. Please personally review and handle candidate communication.`;
          update.manual_followup_since = new Date().toISOString();
          update.audit_log = appendAudit(
            candidate.audit_log,
            "System",
            "Flagged for manual follow-up",
            `"${correction.subject}" already sent before the move back`
          );
        }
      } else if (toStage === "offer_process") {
        // PRD 5.2: entering Offer Process automatically initiates Step 1.
        let step1JustInitiated = false;
        const newOfferSteps = candidate.offer_steps.map((s) => {
          if (s.step_number === 1 && s.status === "not_started") {
            step1JustInitiated = true;
            return { ...s, status: "in_progress" as const, started_at: new Date().toISOString() };
          }
          return s;
        });
        if (step1JustInitiated) {
          update.offer_steps = newOfferSteps;
          drafts.push(offerStepNotification(candidate, requisition, org, newOfferSteps[0], "initiated"));
        }
      } else if (toStage === "interview") {
        drafts.push(candidateMovedInterviewNotification(candidate, requisition));
      } else if (toStage === "selected_awaiting_final_details") {
        drafts.push(selectedAwaitingFinalDetailsNotification(candidate, requisition, org));
      } else if (toStage === "handover_to_hrms") {
        drafts.push(handoverToHrmsNotification(candidate, requisition, org));
      } else if (toStage === "offer_accepted_completed") {
        // Time to Fill (dashboard) is measured from this exact moment, not
        // from current_stage — a candidate who later moves on to Handover
        // would otherwise lose the timestamp of when they actually accepted.
        if (!candidate.offer_accepted_at) update.offer_accepted_at = new Date().toISOString();
        drafts.push(offerAcceptedCompletedNotification(candidate, requisition));
      } else {
        drafts.push(genericStageMovedNotification(candidate, requisition, toStage));
      }

      break;
    }

    case "confirm_final_details": {
      const { final_compensation, final_doj, final_designation, final_location, final_benefits, final_notes } = body;
      if (!final_compensation || !final_doj || !final_designation || !final_location) {
        return NextResponse.json(
          { error: "All final details (compensation, DOJ, designation, location) are required." },
          { status: 400 }
        );
      }
      update = {
        final_compensation,
        final_doj,
        final_designation,
        final_location,
        final_benefits: final_benefits || null,
        final_notes: final_notes || null,
        final_details_locked: true,
      };
      const candidateWithFinalDetails: Candidate = {
        ...candidate,
        final_compensation,
        final_doj,
        final_designation,
        final_location,
        final_benefits: final_benefits || null,
        final_notes: final_notes || null,
      };
      drafts.push(finalDetailsConfirmedNotification(candidateWithFinalDetails, requisition, org));
      break;
    }

    case "reject": {
      const reason = body.rejection_reason as string | undefined;
      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
      }
      update = {
        status: "rejected",
        rejected_from_stage: candidate.current_stage,
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      };
      drafts.push(rejectedNotification(candidate, requisition, reason));
      break;
    }

    case "restore": {
      if (candidate.status !== "rejected") {
        return NextResponse.json({ error: "Only a rejected candidate can be restored." }, { status: 400 });
      }
      const restoredStage = (candidate.rejected_from_stage as Stage) ?? "sourcing";
      update = {
        status: "active",
        current_stage: restoredStage,
        stage_entered_at: new Date().toISOString(),
      };

      const correction = await handleRestoreCorrection(supabase, candidate, requisition);
      let auditLog = appendAudit(
        candidate.audit_log,
        actor,
        "Restored from rejection",
        `Back to ${STAGE_LABELS[restoredStage]}`
      );
      if (correction.kind === "cancelled") {
        auditLog = appendAudit(auditLog, "System", "Cancelled pending email", `"${correction.subject}" — restored before it sent`);
      } else if (correction.kind === "corrected") {
        drafts.push(correction.draft);
      }
      update.audit_log = auditLog;
      break;
    }

    case "clear_followup_flag": {
      if (!candidate.manual_followup_note) {
        return NextResponse.json({ error: "No manual follow-up flag to clear." }, { status: 400 });
      }
      update = {
        manual_followup_note: null,
        manual_followup_since: null,
        audit_log: appendAudit(candidate.audit_log, actor, "Marked manual follow-up as handled"),
      };
      break;
    }

    case "set_on_hold": {
      const note = body.note as string | undefined;
      if (!note || !note.trim()) {
        return NextResponse.json({ error: "A note is required to put a candidate on hold." }, { status: 400 });
      }
      update = {
        on_hold: true,
        on_hold_note: note,
        on_hold_since: new Date().toISOString(),
        audit_log: appendAudit(candidate.audit_log, actor, "Put on hold", note),
      };
      break;
    }

    case "clear_on_hold": {
      if (!candidate.on_hold) {
        return NextResponse.json({ error: "Candidate is not on hold." }, { status: 400 });
      }
      update = {
        on_hold: false,
        on_hold_note: null,
        on_hold_since: null,
        audit_log: appendAudit(candidate.audit_log, actor, "Cleared hold"),
      };
      break;
    }

    case "request_reference_exception": {
      const reason = body.reason as string | undefined;
      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: "A reason is required to request the 2-reference exception." }, { status: 400 });
      }
      if (candidate.reference_exception.status === "pending" || candidate.reference_exception.status === "approved") {
        return NextResponse.json({ error: "A reference exception is already pending or approved for this candidate." }, { status: 400 });
      }
      update = {
        reference_exception: {
          status: "pending",
          requested_by: actor,
          reason,
          requested_at: new Date().toISOString(),
        },
        audit_log: appendAudit(candidate.audit_log, actor, "Requested 2-reference exception", reason),
      };
      drafts.push(referenceExceptionRequestedNotification(candidate, requisition, org, reason));
      break;
    }

    case "decide_reference_exception": {
      const decision = body.decision as "approved" | "denied" | undefined;
      if (decision !== "approved" && decision !== "denied") {
        return NextResponse.json({ error: "Decision must be 'approved' or 'denied'." }, { status: 400 });
      }
      if (candidate.reference_exception.status !== "pending") {
        return NextResponse.json({ error: "No pending reference exception to decide on." }, { status: 400 });
      }
      update = {
        reference_exception: {
          ...candidate.reference_exception,
          status: decision,
          decided_by: actor,
          decided_at: new Date().toISOString(),
        },
        audit_log: appendAudit(candidate.audit_log, actor, `${decision === "approved" ? "Approved" : "Denied"} 2-reference exception`),
      };
      if (decision === "approved") {
        drafts.push(referenceExceptionApprovedNotification(candidate, requisition));
      }
      break;
    }

    case "request_grace_extension": {
      const stepNumber = Number(body.step_number);
      const requestedTatHours = Number(body.requested_tat_hours);
      const reason = body.reason as string | undefined;
      const step = candidate.offer_steps.find((s) => s.step_number === stepNumber);
      if (!step) {
        return NextResponse.json({ error: "Invalid step number." }, { status: 400 });
      }
      if (step.status !== "in_progress") {
        return NextResponse.json({ error: "Grace extensions can only be requested for a step that is in progress." }, { status: 400 });
      }
      if (!reason || !reason.trim() || !requestedTatHours || requestedTatHours <= 0) {
        return NextResponse.json({ error: "A reason and a positive new TAT (hours) are required." }, { status: 400 });
      }
      if (pendingGraceExtension(step)) {
        return NextResponse.json({ error: "This step already has a pending grace extension request." }, { status: 400 });
      }
      const newExtension: GraceExtension = {
        status: "pending",
        requested_by: actor,
        reason,
        requested_at: new Date().toISOString(),
        requested_tat_hours: requestedTatHours,
      };
      const newSteps = candidate.offer_steps.map((s) =>
        s.step_number === stepNumber ? { ...s, grace_extensions: [...(s.grace_extensions ?? []), newExtension] } : s
      );
      update = {
        offer_steps: newSteps,
        audit_log: appendAudit(
          candidate.audit_log,
          actor,
          "Requested grace extension",
          `Step ${stepNumber}: ${step.step_name} → ${requestedTatHours}h. Reason: ${reason}`
        ),
      };
      break;
    }

    case "decide_grace_extension": {
      const stepNumber = Number(body.step_number);
      const decision = body.decision as "approved" | "denied" | undefined;
      const step = candidate.offer_steps.find((s) => s.step_number === stepNumber);
      if (!step) {
        return NextResponse.json({ error: "Invalid step number." }, { status: 400 });
      }
      if (decision !== "approved" && decision !== "denied") {
        return NextResponse.json({ error: "Decision must be 'approved' or 'denied'." }, { status: 400 });
      }
      const pending = pendingGraceExtension(step);
      if (!pending) {
        return NextResponse.json({ error: "No pending grace extension on this step." }, { status: 400 });
      }
      const decidedExtension: GraceExtension = {
        ...pending,
        status: decision,
        decided_by: actor,
        decided_at: new Date().toISOString(),
        decision_note: body.decision_note ?? undefined,
      };
      const newSteps = candidate.offer_steps.map((s) =>
        s.step_number === stepNumber
          ? { ...s, grace_extensions: (s.grace_extensions ?? []).map((g) => (g === pending ? decidedExtension : g)) }
          : s
      );
      update = {
        offer_steps: newSteps,
        audit_log: appendAudit(
          candidate.audit_log,
          actor,
          `${decision === "approved" ? "Approved" : "Denied"} grace extension`,
          `Step ${stepNumber}: ${step.step_name}${decision === "approved" ? ` → new TAT ${pending.requested_tat_hours}h` : ""}`
        ),
      };
      if (decision === "approved") {
        drafts.push(graceExtensionApprovedNotification(candidate, requisition, step, pending.requested_tat_hours));
      }
      break;
    }

    case "update_fields": {
      const fields = body.fields ?? {};
      const changedKeys: string[] = [];
      for (const key of EDITABLE_FIELDS) {
        if (key in fields) {
          update[key] = fields[key];
          changedKeys.push(key);
        }
      }
      if (changedKeys.length === 0) {
        return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
      }

      if ("offer_steps" in fields) {
        const normalizedSteps = normalizeOfferSteps(candidate.offer_steps, fields.offer_steps);

        // Section 7.6 hard block: Step 2 can't be marked complete on fewer
        // than 3 references unless a 2-reference exception is approved.
        const oldStep2 = candidate.offer_steps.find((s) => s.step_number === 2);
        const newStep2 = normalizedSteps.find((s) => s.step_number === 2);
        if (newStep2 && newStep2.status === "complete" && oldStep2?.status !== "complete") {
          const refCount = candidate.reference_records.length;
          if (refCount < 2) {
            return NextResponse.json(
              { error: "At least 2 references are required before Step 2 (Reference Check) can be marked complete." },
              { status: 400 }
            );
          }
          if (refCount === 2 && candidate.reference_exception.status !== "approved") {
            return NextResponse.json(
              {
                error:
                  "Only 2 references on file. Request the 2-reference exception (Section 7.6) and get it approved before completing Step 2.",
              },
              { status: 400 }
            );
          }
        }

        update.offer_steps = normalizedSteps;
        for (const { step, transition } of detectOfferStepTransitions(candidate.offer_steps, normalizedSteps)) {
          drafts.push(offerStepNotification(candidate, requisition, org, step, transition));
        }
        if (detectStep5Completed(candidate.offer_steps, normalizedSteps)) {
          update.current_stage = "offer_accepted_completed";
          update.stage_entered_at = new Date().toISOString();
          if (!candidate.offer_accepted_at) update.offer_accepted_at = new Date().toISOString();
          drafts.push(offerAcceptedCompletedNotification(candidate, requisition));
        }
      }

      if ("offer_document_approvals" in fields) {
        for (const { docType, event } of detectDocumentApprovalEvents(
          candidate.offer_document_approvals,
          fields.offer_document_approvals
        )) {
          drafts.push(offerDocumentNotification(candidate, requisition, org, docType, event));
        }
      }

      if ("tat_status" in fields) {
        const transition = detectTatTransition(candidate.tat_status, fields.tat_status);
        if (transition) {
          drafts.push(tatNotification(candidate, requisition, org, transition));
        }
      }

      update.audit_log = appendAudit(candidate.audit_log, actor, "Updated fields", changedKeys.join(", "));
      break;
    }

    default:
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  // Primary action audit entry (other actions already set their own above).
  if (body.action === "move_stage" || body.action === "confirm_final_details" || body.action === "reject") {
    const actionLabels: Record<string, [string, string | undefined]> = {
      move_stage: ["Moved stage", `${STAGE_LABELS[candidate.current_stage]} → ${STAGE_LABELS[body.to_stage as Stage]}`],
      confirm_final_details: [
        "Confirmed final offer details",
        `${body.final_designation}, ${body.final_compensation}, DOJ ${body.final_doj}, ${body.final_location}`,
      ],
      reject: ["Rejected", `From ${STAGE_LABELS[candidate.current_stage]}: ${body.rejection_reason}`],
    };
    const [action, details] = actionLabels[body.action];
    // Append onto update.audit_log if an earlier branch (e.g. the backward-move
    // correction handling above) already started building one this request —
    // starting fresh from candidate.audit_log here would silently discard it.
    update.audit_log = appendAudit(
      (update.audit_log as Candidate["audit_log"]) ?? candidate.audit_log,
      actor,
      action,
      details
    );
  }

  for (const draft of drafts) {
    update.audit_log = appendAudit(
      update.audit_log as Candidate["audit_log"],
      "System",
      "Notification logged",
      `${draft.subject} → ${recipientsSummary(draft.recipients)}`
    );
  }

  const { data, error } = await supabase
    .from("candidates")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await insertNotifications(supabase, drafts, candidate.requisition_id, id);

  return NextResponse.json(data);
}
