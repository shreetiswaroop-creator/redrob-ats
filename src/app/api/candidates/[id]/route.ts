import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate, CustomFieldDefinition, deriveNextRoundName, GraceExtension, OrgSettings, Requisition, STAGE_LABELS, STAGE_ORDER, Stage } from "@/lib/types";
import { validateCustomFieldValues } from "@/lib/customFields";
import { normalizeOfferSteps, pendingGraceExtension } from "@/lib/tat";
import { fetchDocumentTemplates } from "@/lib/document-templates";
import { DocumentGenerationError, generateAndSendBgvDocument, generateAndSendReferenceCheckDocuments } from "@/lib/document-generation";
import {
  EMPTY_ORG_SETTINGS,
  NotificationDraft,
  candidateMovedInterviewNotification,
  detectDocumentApprovalEvents,
  detectOfferStepTransitions,
  detectStep5Completed,
  detectTatTransition,
  fetchEmailTemplates,
  finalDetailsConfirmedNotification,
  genericStageMovedNotification,
  graceExtensionApprovedNotification,
  handoverToHrmsNotification,
  handleBackwardMoveCorrection,
  handleRestoreCorrection,
  insertNotifications,
  movedToScreeningNotification,
  offerAcceptedCompletedNotification,
  offerDocumentNotification,
  offerStepNotification,
  passedNextRoundNotification,
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
  "linkedin_url",
  "portfolio_url",
  "reason_for_change",
  "interview_rounds",
  "employment_history",
  "reference_records",
  "offer_steps",
  "documents",
  "offer_document_approvals",
  "custom_fields",
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

  const [{ data: requisitionRow }, { data: orgSettingsRow }, templates, docTemplates] = await Promise.all([
    supabase.from("requisitions").select("*").eq("id", candidate.requisition_id).single(),
    supabase.from("org_settings").select("*").eq("id", "default").single(),
    fetchEmailTemplates(supabase),
    fetchDocumentTemplates(supabase),
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
          drafts.push(offerStepNotification(candidate, requisition, org, newOfferSteps[0], "initiated", templates));
        }
      } else if (toStage === "screening") {
        drafts.push(movedToScreeningNotification(candidate, requisition, templates));
      } else if (toStage === "interview") {
        drafts.push(candidateMovedInterviewNotification(candidate, requisition, templates));
      } else if (toStage === "selected_awaiting_final_details") {
        drafts.push(selectedAwaitingFinalDetailsNotification(candidate, requisition, org, templates));
      } else if (toStage === "handover_to_hrms") {
        update.hrms_handover_status = "awaiting_acknowledgement";
        update.hrms_handed_off_at = new Date().toISOString();
        drafts.push(handoverToHrmsNotification(candidate, requisition, org));
      } else if (toStage === "offer_accepted_completed") {
        // Time to Fill (dashboard) is measured from this exact moment, not
        // from current_stage — a candidate who later moves on to Handover
        // would otherwise lose the timestamp of when they actually accepted.
        if (!candidate.offer_accepted_at) update.offer_accepted_at = new Date().toISOString();
        drafts.push(offerAcceptedCompletedNotification(candidate, requisition, templates));
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
      drafts.push(finalDetailsConfirmedNotification(candidateWithFinalDetails, requisition, org, templates));
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
      drafts.push(rejectedNotification(candidate, requisition, reason, templates));
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

      const correction = await handleRestoreCorrection(supabase, candidate, requisition, templates);
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

    case "revoke": {
      if (!candidate.archived) {
        return NextResponse.json({ error: "Candidate is not archived." }, { status: 400 });
      }
      if (candidate.status === "rejected") {
        return NextResponse.json({ error: "Rejected candidates cannot be revoked." }, { status: 400 });
      }
      const revokeRequisitionId = (body.requisition_id as string | undefined) || candidate.requisition_id;
      const movedToDifferentReq = revokeRequisitionId !== candidate.requisition_id;
      update = {
        archived: false,
        archived_at: null,
        archived_reason: null,
        // A revoked candidate re-enters fresh, not wherever they were
        // archived from — otherwise they'd pop back into e.g. Interview
        // Round(s) on a stale requisition instead of being reconsidered.
        requisition_id: revokeRequisitionId,
        current_stage: "sourcing",
        stage_entered_at: new Date().toISOString(),
        audit_log: appendAudit(
          candidate.audit_log,
          actor,
          "Revoked from archive",
          movedToDifferentReq ? `Reconsidered for a different requisition — back in Sourcing` : "Available for reconsideration — back in Sourcing"
        ),
      };
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
      if (session.role !== "hr_management") {
        return NextResponse.json({ error: "Only HR Management can decide a 2-reference exception." }, { status: 403 });
      }
      const decision = body.decision as "approved" | "denied" | undefined;
      if (decision !== "approved" && decision !== "denied") {
        return NextResponse.json({ error: "Decision must be 'approved' or 'denied'." }, { status: 400 });
      }
      if (candidate.reference_exception.status !== "pending") {
        return NextResponse.json({ error: "No pending reference exception to decide on." }, { status: 400 });
      }
      if (candidate.reference_exception.requested_by === actor) {
        return NextResponse.json(
          { error: "You requested this exception — another HR Management account needs to decide it." },
          { status: 403 }
        );
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
      if (session.role !== "hr_management") {
        return NextResponse.json({ error: "Only HR Management can decide a grace extension." }, { status: 403 });
      }
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
      if (pending.requested_by === actor) {
        return NextResponse.json(
          { error: "You requested this extension — another HR Management account needs to decide it." },
          { status: 403 }
        );
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

      if ("custom_fields" in fields) {
        const { data: fieldDefs } = await supabase
          .from("custom_field_definitions")
          .select("*")
          .eq("entity_type", "candidate");
        const result = validateCustomFieldValues((fieldDefs as CustomFieldDefinition[]) ?? [], fields.custom_fields);
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        update.custom_fields = result.cleaned;
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
        const stepTransitions = detectOfferStepTransitions(candidate.offer_steps, normalizedSteps);
        for (const { step, transition } of stepTransitions) {
          drafts.push(offerStepNotification(candidate, requisition, org, step, transition, templates));
        }

        // Document-generation engine (PRD §7.5, §7.7) — Step 2 generates and
        // sends one reference-check document per reference; Step 4 generates
        // and sends the HR BGV document (Professional track only). Both read
        // directly from employment_history/reference_records already on the
        // card — no separate data-entry step. See src/lib/document-generation.ts.
        const step2Initiated = stepTransitions.some((t) => t.step.step_number === 2 && t.transition === "initiated");
        if (step2Initiated) {
          const { result: newReferenceRecords, auditEntries } = await generateAndSendReferenceCheckDocuments(
            supabase,
            candidate,
            requisition,
            org,
            templates,
            docTemplates,
            actor
          );
          update.reference_records = newReferenceRecords;
          update.audit_log = [...((update.audit_log as Candidate["audit_log"]) ?? candidate.audit_log), ...auditEntries];
        }

        const step4Initiated = stepTransitions.some((t) => t.step.step_number === 4 && t.transition === "initiated");
        if (step4Initiated) {
          try {
            const { result: bgvResult, auditEntries } = await generateAndSendBgvDocument(
              supabase,
              candidate,
              requisition,
              org,
              templates,
              docTemplates,
              actor
            );
            if (bgvResult.pathname) {
              update.bgv_document_pathname = bgvResult.pathname;
              update.bgv_document_filename = bgvResult.filename;
            }
            update.audit_log = [...((update.audit_log as Candidate["audit_log"]) ?? candidate.audit_log), ...auditEntries];
          } catch (err) {
            if (err instanceof DocumentGenerationError) {
              return NextResponse.json({ error: err.message }, { status: 400 });
            }
            throw err;
          }
        }

        if (detectStep5Completed(candidate.offer_steps, normalizedSteps)) {
          update.current_stage = "offer_accepted_completed";
          update.stage_entered_at = new Date().toISOString();
          if (!candidate.offer_accepted_at) update.offer_accepted_at = new Date().toISOString();
          drafts.push(offerAcceptedCompletedNotification(candidate, requisition, templates));
        }
      }

      if ("offer_document_approvals" in fields) {
        for (const { docType, event } of detectDocumentApprovalEvents(
          candidate.offer_document_approvals,
          fields.offer_document_approvals
        )) {
          const doc = fields.offer_document_approvals[docType];
          // Stamped here (not read back from the client) so the Approvals
          // page's "how long has this been waiting" figure can't be spoofed
          // or accidentally skipped by whatever the recruiter's request sent.
          if (event === "draft_uploaded" && doc) doc.submitted_at = new Date().toISOString();
          drafts.push(offerDocumentNotification(candidate, requisition, org, docType, event, templates, doc?.doc_link));
        }
      }

      if ("tat_status" in fields) {
        const transition = detectTatTransition(candidate.tat_status, fields.tat_status);
        if (transition) {
          drafts.push(tatNotification(candidate, requisition, org, transition));
        }
      }

      // Append onto update.audit_log if the document-generation branch above
      // already started building one this request — starting fresh from
      // candidate.audit_log here would silently discard those entries.
      update.audit_log = appendAudit(
        (update.audit_log as Candidate["audit_log"]) ?? candidate.audit_log,
        actor,
        "Updated fields",
        changedKeys.join(", ")
      );
      break;
    }

    case "notify_next_round": {
      const roundName = body.round_name as string | undefined;
      if (!roundName || !roundName.trim()) {
        return NextResponse.json({ error: "A round name is required." }, { status: 400 });
      }
      const nextRoundName = deriveNextRoundName(roundName);
      drafts.push(passedNextRoundNotification(candidate, requisition, roundName, nextRoundName, templates));
      update = {
        audit_log: appendAudit(candidate.audit_log, actor, "Notified candidate — needs another round", `${roundName} → ${nextRoundName}`),
      };
      break;
    }

    case "mark_hrms_acknowledged": {
      if (session.role !== "hr_management") {
        return NextResponse.json({ error: "Only HR Management can acknowledge an HRMS handover." }, { status: 403 });
      }
      if (candidate.hrms_handover_status !== "awaiting_acknowledgement") {
        return NextResponse.json({ error: "No pending HRMS handover to acknowledge." }, { status: 400 });
      }
      update = {
        hrms_handover_status: "acknowledged",
        hrms_acknowledged_at: new Date().toISOString(),
        audit_log: appendAudit(candidate.audit_log, actor, "Acknowledged HRMS handover"),
      };
      break;
    }

    case "add_note": {
      const text = (body.text as string | undefined)?.trim();
      if (!text) {
        return NextResponse.json({ error: "Note text is required." }, { status: 400 });
      }
      update = {
        candidate_notes: [...candidate.candidate_notes, { author: actor, text, created_at: new Date().toISOString() }],
      };
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

  await insertNotifications(supabase, drafts, candidate.requisition_id, id, org);

  return NextResponse.json(data);
}
