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
  EmailTemplate,
  EmailTemplateKey,
  EMAIL_TEMPLATE_KEYS,
} from "./types";
import { appendAudit } from "./audit";
import { computeStepTatStatus } from "./tat";
import { decryptToken } from "./token-crypto";
import { refreshAccessToken } from "./google-oauth";
import { sendGmailMessage } from "./google-gmail";

export type EmailTemplateMap = Partial<Record<EmailTemplateKey, EmailTemplate>>;

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

// Offer-stage templates fire after confirm_final_details, so
// designation/compensation/doj/location are already on the candidate
// record by then. A template only pulls the {{tokens}} it actually
// contains, so it's fine to hand every template the full set.
export function baseMergeVars(c: Candidate, req: Requisition): Record<string, string> {
  return {
    candidate_name: c.name,
    candidate_code: c.candidate_code,
    requisition_title: req.title,
    req_code: req.req_code,
    designation: c.final_designation ?? "",
    compensation: c.final_compensation ?? "",
    doj: c.final_doj ?? "",
    location: c.final_location ?? "",
  };
}

export interface NotificationDraft {
  trigger_event: string;
  recipients: NotificationRecipient[];
  subject: string;
  body: string;
  isCorrection?: boolean; // true for "please disregard our previous message" emails — never delayed further
}

export const PENDING_WINDOW_MS = 15 * 60 * 1000; // 15 minutes, per the send-delay buffer

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
  live_sending_enabled: false,
  default_step_tat_hours: 24,
  logo_url: null,
};

// Fetched once per request alongside org settings (same pattern), not once
// per notification builder call — these builders stay synchronous.
export async function fetchEmailTemplates(supabase: SupabaseClient): Promise<EmailTemplateMap> {
  const { data } = await supabase.from("email_templates").select("*");
  const map: EmailTemplateMap = {};
  for (const row of (data as EmailTemplate[]) ?? []) {
    if (EMAIL_TEMPLATE_KEYS.includes(row.template_key as EmailTemplateKey)) {
      map[row.template_key as EmailTemplateKey] = row;
    }
  }
  return map;
}

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

// Moved to Screening — falls through the genericStageMovedNotification
// catch-all before this phase; now gets its own dedicated content, same
// pattern as candidateMovedInterviewNotification below.
export function movedToScreeningNotification(
  c: Candidate,
  req: Requisition,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)];
  const template = templates.moved_to_screening;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: "moved_to_screening",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "moved_to_screening",
    recipients,
    subject: `Your candidature has moved to Screening — ${req.title}`,
    body: `Hi ${c.name}, your candidature for ${req.title} (${c.candidate_code}) has moved to the Screening round.`,
  };
}

export function candidateMovedInterviewNotification(
  c: Candidate,
  req: Requisition,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c), ...panelRecipients(c)];
  const template = templates.interview_stage;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: "candidate_moved_interview",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "candidate_moved_interview",
    recipients,
    subject: `Your candidature has moved to the Interview stage — ${req.title}`,
    body: `Hi ${c.name}, your candidature for ${req.title} (${c.candidate_code}) has moved to the Interview stage. Our recruiter will call you shortly to schedule it.`,
  };
}

// The date/time formatting in the candidate-facing email uses a fixed IST
// zone (this org's locations are all in India) rather than the server's own
// timezone, so the printed time is meaningful regardless of where the
// serverless function happens to run.
const IST_DATE_OPTS: Intl.DateTimeFormatOptions = { dateStyle: "full", timeZone: "Asia/Kolkata" };
const IST_TIME_OPTS: Intl.DateTimeFormatOptions = { timeStyle: "short", timeZone: "Asia/Kolkata" };

// meetingLink is manually pasted in by the recruiter on the scheduling form
// (a real Google Meet link would need the Calendar API's conferencing
// scopes, which are blocked by the same Workspace org-policy issue as
// Gmail — see project notes). If provided, it renders as its own line; if
// blank, the {{meeting_link}} line is simply empty rather than showing a
// fake/broken link — this upgrades to an auto-created link with no
// template changes once Calendar API access unblocks.
export function interviewScheduledNotification(
  c: Candidate,
  req: Requisition,
  roundName: string,
  scheduledAtIso: string,
  durationMinutes: number,
  templates: EmailTemplateMap = {},
  meetingLink?: string
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c), ...panelRecipients(c)];
  const scheduledDate = new Date(scheduledAtIso);
  const vars = {
    ...baseMergeVars(c, req),
    round_name: roundName,
    interview_date: scheduledDate.toLocaleDateString("en-IN", IST_DATE_OPTS),
    interview_time: `${scheduledDate.toLocaleTimeString("en-IN", IST_TIME_OPTS)} IST`,
    duration: `${durationMinutes} minutes`,
    meeting_link: meetingLink ? `Meeting link: ${meetingLink}` : "",
  };
  const template = templates.interview_scheduled;
  if (template) {
    return {
      trigger_event: "interview_scheduled",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "interview_scheduled",
    recipients,
    subject: `${roundName} scheduled — ${req.title}`,
    body: `${c.name}'s ${roundName} interview for ${req.title} (${c.candidate_code}) is scheduled for ${vars.interview_date} at ${vars.interview_time} (${vars.duration}).${
      vars.meeting_link ? `\n\n${vars.meeting_link}` : ""
    }`,
  };
}

// Passed the final interview round — previously internal-only (an action
// prompt for HM/HR/recruiter to go confirm final details); now also tells
// the candidate directly, same shared-draft pattern as every other
// candidate-facing notification in this file.
export function selectedAwaitingFinalDetailsNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), hrManagementRecipient(org), recruiterRecipient(c)];
  const template = templates.passed_final_round;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: "selected_awaiting_final_details",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "selected_awaiting_final_details",
    recipients,
    subject: `You've cleared the final round — ${req.title}`,
    body: `Hi ${c.name}, congratulations — you've passed the final interview round for ${req.title} (${req.req_code}). Our recruiter will call you shortly to discuss final details.`,
  };
}

export function finalDetailsConfirmedNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), recruiterRecipient(c), hiringManagerRecipient(req), hrManagementRecipient(org)];
  const template = templates.final_details_confirmed_candidate;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: "final_details_confirmed",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "final_details_confirmed",
    recipients,
    subject: `Your final offer details are confirmed — ${req.title}`,
    body: `Hi ${c.name}, your final offer details for ${req.title} have been confirmed: ${c.final_designation}, ${c.final_compensation}, DOJ ${c.final_doj}, ${c.final_location}${
      c.final_benefits ? `, benefits: ${c.final_benefits}` : ""
    }. The Offer Process is now starting.`,
  };
}

// step_number -> the template key that covers its "initiated" email (Steps
// 1/2/4 — Pre-Offer, Reference Check, HR BGV). Every other transition
// (these steps' "completed", and Step 3/5 entirely) keeps the hardcoded
// text below — this task only touches the 3 keys here.
const OFFER_STEP_TEMPLATE_KEY: Partial<Record<number, EmailTemplateKey>> = {
  1: "pre_offer",
  2: "reference_check",
  4: "hr_bgv",
};

export function offerStepNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  step: OfferStep,
  transition: "initiated" | "completed",
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients: NotificationRecipient[] =
    step.step_number === 1
      ? [candidateRecipient(c), recruiterRecipient(c)]
      : [recruiterRecipient(c), commonHrMailboxRecipient(org)];

  const templateKey = transition === "initiated" ? OFFER_STEP_TEMPLATE_KEY[step.step_number] : undefined;
  const template = templateKey ? templates[templateKey] : undefined;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: `offer_step_${step.step_number}_${transition}`,
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }

  return {
    trigger_event: `offer_step_${step.step_number}_${transition}`,
    recipients,
    subject: `Offer Step ${step.step_number} (${step.step_name}) ${transition} — ${c.name}`,
    body: `Step ${step.step_number}: ${step.step_name} has been ${transition} for ${c.name} (${req.title}, ${c.candidate_code}).`,
  };
}

export function offerAcceptedCompletedNotification(
  c: Candidate,
  req: Requisition,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), recruiterRecipient(c), hiringManagerRecipient(req)];
  const template = templates.offer_accepted_completed_candidate;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: "offer_accepted_completed",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "offer_accepted_completed",
    recipients,
    subject: `Welcome aboard, ${c.name}!`,
    body: `Hi ${c.name}, the offer process for ${req.title} is now complete. We look forward to you joining us on ${c.final_doj ?? "the agreed date"}.`,
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

export function rejectedNotification(
  c: Candidate,
  req: Requisition,
  reason: string,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)];
  const template = templates.rejection;
  if (template) {
    const vars = { ...baseMergeVars(c, req), reason };
    return {
      trigger_event: "candidate_rejected",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "candidate_rejected",
    recipients,
    subject: `Update on your application — ${req.title}`,
    body: `Thank you for your interest in ${req.title}. After careful consideration, we will not be moving forward at this time.\n\n(Internal note — reason: ${reason})`,
  };
}

// Rejection → Restore correction: only used when the original rejection
// email already sent (if it was still pending, we just cancel it — no email
// needed at all).
export function rejectionDisregardNotification(
  c: Candidate,
  req: Requisition,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)];
  const template = templates.reconsideration;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: "candidate_rejected_disregard",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
      isCorrection: true,
    };
  }
  return {
    trigger_event: "candidate_rejected_disregard",
    recipients,
    subject: `Please disregard our previous message — ${req.title}`,
    body: `Please disregard our previous message about your application for ${req.title}. Your application is active and under review — we apologize for the confusion.`,
    isCorrection: true,
  };
}

type DocEvent = "draft_uploaded" | "changes_requested" | "approved" | "final_pdf_uploaded" | "signed";

// Only these two docType/event combinations (the ones that actually send to
// the candidate) have an editable template — draft_uploaded/changes_requested
// stay internal, hardcoded notices.
function offerDocumentTemplateKey(docType: "offer_letter" | "employee_agreement", event: DocEvent): EmailTemplateKey | undefined {
  if (docType === "offer_letter" && event === "approved") return "offer_letter";
  if (docType === "employee_agreement" && event === "signed") return "employee_agreement";
  return undefined;
}

export function offerDocumentNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  docType: "offer_letter" | "employee_agreement",
  event: DocEvent,
  templates: EmailTemplateMap = {},
  docLink?: string
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
      // Offer Letter's "approved" IS the candidate send — no signature
      // stage. Employee Agreement's content approval is an internal
      // milestone only (PRD §7's signature loop still has to happen) — the
      // candidate isn't notified until it's actually signed.
      if (docType === "employee_agreement") {
        recipients = [recruiterRecipient(c)];
        subject = `${label} content approved — upload the final PDF for ${c.name}`;
      } else {
        recipients = [candidateRecipient(c), recruiterRecipient(c)];
        subject = `${label} approved and sent to ${c.name}`;
      }
      break;
    case "final_pdf_uploaded":
      recipients = [hrManagementRecipient(org)];
      subject = `${label} ready to sign — ${c.name}`;
      break;
    case "signed":
      recipients = [candidateRecipient(c), recruiterRecipient(c)];
      subject = `${label} e-signed and sent to ${c.name}`;
      break;
  }

  const templateKey = offerDocumentTemplateKey(docType, event);
  const template = templateKey ? templates[templateKey] : undefined;
  if (template) {
    const vars = { ...baseMergeVars(c, req), doc_link: docLink ?? "" };
    return {
      trigger_event: `${docType}_${event}`,
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }

  const instruction =
    event === "final_pdf_uploaded"
      ? " Download it from the candidate's card and sign it in your e-signature tool of choice (e.g. DocuSign), then upload the signed copy back to the same field."
      : docLink
        ? ` Review it here: ${docLink}`
        : "";

  return {
    trigger_event: `${docType}_${event}`,
    recipients,
    subject,
    body: `${subject} (${req.title}, ${c.candidate_code}).${instruction}`,
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

// Steps 1/3/5 are candidate-facing/personal-mailbox steps (Pre-Offer,
// Offer Letter, Employee Agreement) — the candidate is literally the one
// expected to respond, so only these get pulled into the reminder once
// breached. Steps 2/4 (Reference Check, HR BGV) sit with references/HR
// contacts, not the candidate, so those stay internal-only regardless of
// status — same as at_risk always staying internal-only for every step.
const CANDIDATE_FACING_TAT_STEPS = new Set([1, 3, 5]);

export function stepTatNotification(
  c: Candidate,
  req: Requisition,
  org: OrgSettings,
  step: OfferStep,
  status: "at_risk" | "breached",
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const label = status === "at_risk" ? "at risk" : "breached";
  const includeCandidate = status === "breached" && CANDIDATE_FACING_TAT_STEPS.has(step.step_number);

  if (includeCandidate) {
    const recipients = [candidateRecipient(c), recruiterRecipient(c), hrManagementRecipient(org)];
    const template = templates.step_tat_breached_candidate_reminder;
    if (template) {
      const vars = { ...baseMergeVars(c, req), step_number: String(step.step_number), step_name: step.step_name };
      return {
        trigger_event: `step_tat_${status}`,
        recipients,
        subject: renderTemplate(template.subject_template, vars),
        body: renderTemplate(template.body_template, vars),
      };
    }
    return {
      trigger_event: `step_tat_${status}`,
      recipients,
      subject: `Reminder — action needed on ${step.step_name}`,
      body: `Hi ${c.name}, this is a reminder to please revert to the email we already sent you regarding Step ${step.step_number}: ${step.step_name} (${req.title}).`,
    };
  }

  return {
    trigger_event: `step_tat_${status}`,
    recipients: [recruiterRecipient(c), hrManagementRecipient(org)],
    subject: `Step ${step.step_number} (${step.step_name}) TAT ${label} — ${c.name}`,
    body: `Step ${step.step_number}: ${step.step_name} for ${c.name} (${req.title}, ${c.candidate_code}) is TAT ${label}.`,
  };
}

// Passed a round but not the final one — fired from InterviewClearedModal's
// "Needs another round" path, a manual recruiter action rather than a
// candidate-record field change (there's no stage transition here, just an
// email), so it has no automatic call site in the move_stage switch.
export function passedNextRoundNotification(
  c: Candidate,
  req: Requisition,
  currentRoundName: string,
  nextRoundName: string,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)];
  const template = templates.passed_next_round;
  if (template) {
    const vars = { ...baseMergeVars(c, req), round_name: currentRoundName, next_round_name: nextRoundName };
    return {
      trigger_event: "passed_next_round",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "passed_next_round",
    recipients,
    subject: `You've cleared ${currentRoundName} — ${req.title}`,
    body: `Hi ${c.name}, congratulations — you've passed ${currentRoundName} for ${req.title} (${c.candidate_code}) and have moved to ${nextRoundName}. Our recruiter will call you shortly to schedule it.`,
  };
}

// Fired once per candidate when a requisition's on-hold-timeout archive is
// revoked (see the "revoke" action in src/app/api/requisitions/[id]/route.ts)
// — every candidate archived_reason: "requisition_on_hold" gets their own
// copy, since each is a distinct person who needs to hear the position is
// back on.
export function positionReopenedNotification(
  c: Candidate,
  req: Requisition,
  templates: EmailTemplateMap = {}
): NotificationDraft {
  const recipients = [candidateRecipient(c), hiringManagerRecipient(req), recruiterRecipient(c)];
  const template = templates.position_reopened;
  if (template) {
    const vars = baseMergeVars(c, req);
    return {
      trigger_event: "position_reopened",
      recipients,
      subject: renderTemplate(template.subject_template, vars),
      body: renderTemplate(template.body_template, vars),
    };
  }
  return {
    trigger_event: "position_reopened",
    recipients,
    subject: `Good news — ${req.title} has reopened`,
    body: `Hi ${c.name}, ${req.title} (${req.req_code}) was temporarily on hold and has now reopened. Please confirm you're still available to continue — our recruiter will be calling you shortly.`,
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
    // Fires on every genuine transition INTO "Under Review" — first
    // submission (undefined -> pending) and every resubmission after
    // changes (changes_requested -> pending) alike. Previously this
    // compared `version` strings, which meant resubmitting without
    // manually bumping a version number silently skipped HR's
    // notification — decoupled from version entirely now that version is
    // an auto-incrementing display counter, not a user-typed value.
    if (newDoc.doc_link && oldDoc?.review_status !== "pending" && newDoc.review_status === "pending") {
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
// no reason to wait) go into the queue for 15 minutes instead of being
// logged immediately, so a mistake can still be caught. Correction emails
// ("please disregard...") skip the queue — they're urgent by nature.
export interface DeliveryResult {
  attempted: boolean;
  sent: boolean;
}

export interface OutboundSender {
  senderName: string | null;
  senderEncryptedToken: string;
  senderMailboxLabel: string | null;
}

// Whoever "owns" an outbound email: the candidate's recruiter if they've
// connected Gmail, otherwise the Common HR Mailbox if it's connected.
// Neither connected -> null, caller stays log-only. Shared by
// deliverNotification below and the document-generation send flow
// (src/lib/document-generation.ts), which always sends from the Common HR
// Mailbox but goes through the same resolution/decrypt/refresh path.
export async function resolveOutboundSender(
  supabase: SupabaseClient,
  candidateId: string | null
): Promise<OutboundSender | null> {
  if (candidateId) {
    const { data: candidate } = await supabase.from("candidates").select("owner_email").eq("id", candidateId).single();
    if (candidate?.owner_email) {
      const { data: ownerUser } = await supabase
        .from("users")
        .select("name, gmail_refresh_token_encrypted")
        .eq("email", candidate.owner_email)
        .maybeSingle();
      if (ownerUser?.gmail_refresh_token_encrypted) {
        return {
          senderName: ownerUser.name,
          senderEncryptedToken: ownerUser.gmail_refresh_token_encrypted,
          senderMailboxLabel: candidate.owner_email,
        };
      }
    }
  }

  const { data: orgRow } = await supabase
    .from("org_settings")
    .select("common_hr_mailbox_name, common_hr_mailbox_email, common_hr_gmail_refresh_token_encrypted")
    .eq("id", "default")
    .single();
  if (orgRow?.common_hr_gmail_refresh_token_encrypted) {
    return {
      senderName: orgRow.common_hr_mailbox_name || "Redrob HR",
      senderEncryptedToken: orgRow.common_hr_gmail_refresh_token_encrypted,
      senderMailboxLabel: orgRow.common_hr_mailbox_email,
    };
  }

  return null;
}

// Attempts a real Gmail send for one notification row — entirely gated
// behind org_settings.live_sending_enabled, so this is a no-op (behaves
// exactly like the log-only Phase 2-3 behavior) until that's turned on.
export async function deliverNotification(
  supabase: SupabaseClient,
  notification: { id: string; candidate_id: string | null; recipients: NotificationRecipient[]; subject: string; body: string },
  org: OrgSettings
): Promise<DeliveryResult> {
  if (!org.live_sending_enabled) return { attempted: false, sent: false };

  const sender = await resolveOutboundSender(supabase, notification.candidate_id);
  if (!sender) return { attempted: false, sent: false };

  try {
    const refreshToken = decryptToken(sender.senderEncryptedToken);
    const { access_token } = await refreshAccessToken(refreshToken);

    const emails = notification.recipients.filter((r) => r.email).map((r) => r.email as string);
    const candidateEmail = notification.recipients.find((r) => r.role === "Candidate")?.email;
    const to = candidateEmail ? [candidateEmail] : emails.slice(0, 1);
    const cc = emails.filter((e) => !to.includes(e));

    const { messageId } = await sendGmailMessage({
      accessToken: access_token,
      fromLabel: sender.senderName ?? "Redrob ATS",
      to,
      cc,
      subject: notification.subject,
      body: notification.body,
    });

    await supabase
      .from("notifications")
      .update({ sender_mailbox: sender.senderMailboxLabel, gmail_message_id: messageId })
      .eq("id", notification.id);

    return { attempted: true, sent: true };
  } catch (err) {
    await supabase
      .from("notifications")
      .update({ status: "failed", cancel_reason: err instanceof Error ? err.message : "Send failed" })
      .eq("id", notification.id);
    return { attempted: true, sent: false };
  }
}

export async function insertNotifications(
  supabase: SupabaseClient,
  drafts: NotificationDraft[],
  requisitionId: string | null,
  candidateId: string | null,
  org?: OrgSettings
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

  if (org) {
    // Immediate (non-delayed) rows can be delivered right away; delayed
    // candidate-facing ones wait for processDuePendingNotifications.
    const { data: inserted } = await supabase
      .from("notifications")
      .insert(rows)
      .select("id, candidate_id, recipients, subject, body, status");
    for (const row of inserted ?? []) {
      if (row.status === "sent") await deliverNotification(supabase, row, org);
    }
  } else {
    await supabase.from("notifications").insert(rows);
  }

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
  org: OrgSettings,
  templates: EmailTemplateMap = {}
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
        const draft = stepTatNotification(candidate, requisition, org, step, computed, templates);
        drafts.push(draft);
        auditLog = appendAudit(auditLog, "System", "Notification logged", `${draft.subject} → ${recipientsSummary(draft.recipients)}`);
        changed = true;
        return { ...step, last_notified_tat_status: computed };
      }
      return step;
    });

    if (changed) {
      await supabase.from("candidates").update({ offer_steps: updatedSteps, audit_log: auditLog }).eq("id", candidate.id);
      await insertNotifications(supabase, drafts, candidate.requisition_id, candidate.id, org);
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
  requisition: Requisition,
  templates: EmailTemplateMap = {}
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
    return { kind: "corrected", draft: rejectionDisregardNotification(candidate, requisition, templates) };
  }

  return { kind: "none" };
}

// Processes every notification whose 15-minute (or immediate) window has
// elapsed. Called both by the secured worker endpoint an external scheduler
// pings every few minutes, AND opportunistically on board page load (same
// belt-and-suspenders pattern as sweepStepTatBreaches) so testing isn't
// blocked on the external scheduler being configured yet.
//
// Attempts a real Gmail send via deliverNotification (gated behind
// org_settings.live_sending_enabled) before marking the row resolved — a
// failed send is left as 'failed' (deliverNotification's own doing)
// instead of being marked 'sent' like everything else.
export async function processDuePendingNotifications(
  supabase: SupabaseClient,
  org: OrgSettings
): Promise<{ processed: number }> {
  const { data: due } = await supabase
    .from("notifications")
    .select("id, candidate_id, recipients, subject, body")
    .eq("status", "pending")
    .lte("scheduled_send_at", new Date().toISOString());

  if (!due || due.length === 0) return { processed: 0 };

  for (const notif of due) {
    const result = await deliverNotification(supabase, notif, org);
    if (!result.attempted || result.sent) {
      await supabase.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", notif.id);
    }

    if (notif.candidate_id) {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("audit_log")
        .eq("id", notif.candidate_id)
        .single();
      if (candidate) {
        const label = result.attempted && !result.sent ? "Email send failed" : "Email sent";
        const auditLog = appendAudit(candidate.audit_log, "System", label, notif.subject);
        await supabase.from("candidates").update({ audit_log: auditLog }).eq("id", notif.candidate_id);
      }
    }
  }

  return { processed: due.length };
}
