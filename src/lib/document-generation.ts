import { SupabaseClient } from "@supabase/supabase-js";
import { put, get, del } from "@vercel/blob";
import {
  AuditLogEntry,
  Candidate,
  DocumentTemplateKey,
  EmploymentHistoryEntry,
  NotificationRecipient,
  OrgSettings,
  ReferenceRecord,
  Requisition,
} from "./types";
import { baseMergeVars, renderTemplate, resolveOutboundSender, EmailTemplateMap } from "./notifications";
import { DocumentTemplateMap } from "./document-templates";
import { renderOfferDocumentPdf } from "./pdf/OfferDocumentPdf";
import { decryptToken } from "./token-crypto";
import { refreshAccessToken } from "./google-oauth";
import { sendGmailMessage } from "./google-gmail";

// Thrown for data-completeness gates the recruiter must fix on the
// candidate card before the step can initiate (mirrors the existing
// 2-reference-exception hard-block in candidates/[id]/route.ts) — the route
// catches this and returns a 400 before any mutation. Distinct from
// generation/send failures below, which are logged and don't block the step
// transition.
export class DocumentGenerationError extends Error {}

export type CurrentEmployerResolution =
  | { kind: "resolved"; entry: EmploymentHistoryEntry }
  | { kind: "none" }
  | { kind: "ambiguous" };

// is_current-flagged entry first; if none and there's exactly one employment
// entry, that's unambiguous; if none and 2+ entries, the caller can't guess
// which is current without fragile free-text tenure_to parsing.
export function resolveCurrentEmployer(candidate: Candidate): CurrentEmployerResolution {
  const flagged = candidate.employment_history.find((e) => e.is_current);
  if (flagged) return { kind: "resolved", entry: flagged };
  if (candidate.employment_history.length === 0) return { kind: "none" };
  if (candidate.employment_history.length === 1) return { kind: "resolved", entry: candidate.employment_history[0] };
  return { kind: "ambiguous" };
}

async function fetchPhotoDataUri(candidate: Candidate): Promise<string | null> {
  if (!candidate.photo_pathname) return null;
  try {
    const result = await get(candidate.photo_pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const buffer = Buffer.from(await new Response(result.stream as unknown as BodyInit).arrayBuffer());
    const contentType = result.blob.contentType || "image/jpeg";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

// Always sends from the Common HR Mailbox (candidateId: null skips
// resolveOutboundSender's recruiter-first branch) — generation/storage
// always happens regardless of org.live_sending_enabled (matches the
// existing "logged regardless of live-sending state" convention); only the
// actual Gmail call is gated. Always logs a `notifications` row so the send
// shows up on the Notifications log page like every other trigger.
async function sendDocumentEmail(
  supabase: SupabaseClient,
  org: OrgSettings,
  requisitionId: string,
  candidateId: string,
  params: {
    triggerEvent: string;
    recipientRole: string;
    recipientName?: string | null;
    to: string;
    subject: string;
    body: string;
    attachment: { filename: string; contentType: string; content: Buffer };
  }
): Promise<void> {
  const recipients: NotificationRecipient[] = [{ role: params.recipientRole, name: params.recipientName ?? null, email: params.to }];
  const now = new Date().toISOString();

  let status: "sent" | "failed" = "sent";
  let senderMailbox: string | null = null;
  let gmailMessageId: string | null = null;
  let cancelReason: string | null = null;

  if (org.live_sending_enabled) {
    const sender = await resolveOutboundSender(supabase, null);
    if (sender) {
      try {
        const refreshToken = decryptToken(sender.senderEncryptedToken);
        const { access_token } = await refreshAccessToken(refreshToken);
        const result = await sendGmailMessage({
          accessToken: access_token,
          fromLabel: sender.senderName ?? "Redrob HR",
          to: [params.to],
          subject: params.subject,
          body: params.body,
          attachments: [params.attachment],
        });
        senderMailbox = sender.senderMailboxLabel;
        gmailMessageId = result.messageId;
      } catch (err) {
        status = "failed";
        cancelReason = err instanceof Error ? err.message : "Send failed";
      }
    }
  }

  await supabase.from("notifications").insert({
    trigger_event: params.triggerEvent,
    requisition_id: requisitionId,
    candidate_id: candidateId,
    recipients,
    subject: params.subject,
    body: params.body,
    status,
    scheduled_send_at: now,
    sent_at: status === "sent" ? now : null,
    sender_mailbox: senderMailbox,
    gmail_message_id: gmailMessageId,
    cancel_reason: cancelReason,
  });

  if (status === "failed") throw new Error(cancelReason ?? "Send failed");
}

export interface DocumentGenerationOutcome<T> {
  result: T;
  auditEntries: AuditLogEntry[];
}

// Step 2 (Reference Check) initiation — one document per reference, from the
// correct template variant, merging in THAT reference's own linked
// Employment History entry (or none, for an academic/other reference) —
// never one dataset applied to all references (PRD §7.7). A failure on one
// reference (missing template, render/send error) is logged and doesn't
// block the others — Promise.allSettled, not Promise.all.
export async function generateAndSendReferenceCheckDocuments(
  supabase: SupabaseClient,
  candidate: Candidate,
  requisition: Requisition,
  org: OrgSettings,
  emailTemplates: EmailTemplateMap,
  docTemplates: DocumentTemplateMap,
  actor: string
): Promise<DocumentGenerationOutcome<ReferenceRecord[]>> {
  if (candidate.reference_records.length === 0) {
    return { result: candidate.reference_records, auditEntries: [] };
  }

  const templateKey: DocumentTemplateKey =
    candidate.candidate_track === "fresher_intern" ? "reference_check_fresher_intern" : "reference_check_professional";
  const template = docTemplates[templateKey];
  const photoDataUri = await fetchPhotoDataUri(candidate);
  const coveringTemplate = emailTemplates.reference_check;
  const coveringVars = baseMergeVars(candidate, requisition);
  const subject = coveringTemplate
    ? renderTemplate(coveringTemplate.subject_template, coveringVars)
    : `Reference check for ${candidate.name}`;
  const body = coveringTemplate
    ? renderTemplate(coveringTemplate.body_template, coveringVars)
    : `Please find attached the reference check form for ${candidate.name}.`;

  const results = await Promise.allSettled(
    candidate.reference_records.map(async (ref) => {
      if (!template) throw new Error(`No "${templateKey}" document template configured — apply the latest schema.sql.`);
      if (!ref.email) throw new Error("No email on file for this reference.");

      const employmentEntry = ref.linked_employment_history_id
        ? candidate.employment_history.find((e) => e.id === ref.linked_employment_history_id) ?? null
        : null;

      const pdfBuffer = await renderOfferDocumentPdf({
        templateLabel: template.label,
        candidate,
        requisition,
        employmentEntry,
        referenceName: ref.name,
        photoDataUri,
        template,
      });

      // A regeneration (step reset and reinitiated) would otherwise leave the
      // previous PDF permanently orphaned in Blob storage — same delete-
      // before-replace pattern as the resume/photo upload routes.
      if (ref.document_pathname) await del(ref.document_pathname).catch(() => {});

      const pathname = `reference-check-docs/${candidate.id}/${ref.id}-${Date.now()}.pdf`;
      const blob = await put(pathname, pdfBuffer, { access: "private", contentType: "application/pdf" });

      await sendDocumentEmail(supabase, org, requisition.id, candidate.id, {
        triggerEvent: "reference_check_document_sent",
        recipientRole: "Reference",
        recipientName: ref.name,
        to: ref.email,
        subject,
        body,
        attachment: {
          filename: `Reference-Check-${candidate.candidate_code}-${(ref.name || ref.id).replace(/[^a-zA-Z0-9-]+/g, "_")}.pdf`,
          contentType: "application/pdf",
          content: pdfBuffer,
        },
      });

      return blob.pathname;
    })
  );

  const now = new Date().toISOString();
  const referenceRecords: ReferenceRecord[] = candidate.reference_records.map((ref, i) => {
    const outcome = results[i];
    if (outcome.status === "fulfilled") {
      return { ...ref, document_pathname: outcome.value, document_sent_at: now };
    }
    return ref;
  });

  const auditEntries: AuditLogEntry[] = candidate.reference_records.map((ref, i) => {
    const outcome = results[i];
    if (outcome.status === "fulfilled") {
      return {
        timestamp: now,
        actor,
        action: "Reference-check document generated & sent",
        details: `${ref.name || "(unnamed)"} <${ref.email}>`,
      };
    }
    return {
      timestamp: now,
      actor: "System",
      action: "Reference-check document failed",
      details: `${ref.name || "(unnamed)"}: ${outcome.reason instanceof Error ? outcome.reason.message : "Unknown error"}`,
    };
  });

  return { result: referenceRecords, auditEntries };
}

// Step 4 (HR Background Verification) initiation — Professional track only
// (PRD §7.8, BGV doesn't apply to Fresher/Intern). Ambiguous/missing current
// employer or a missing HR contact email are data-completeness gates the
// recruiter must fix (DocumentGenerationError, hard-blocks the step
// transition) — a missing template or a render/send failure is a softer
// infra issue that's logged instead of blocking the step.
export async function generateAndSendBgvDocument(
  supabase: SupabaseClient,
  candidate: Candidate,
  requisition: Requisition,
  org: OrgSettings,
  emailTemplates: EmailTemplateMap,
  docTemplates: DocumentTemplateMap,
  actor: string
): Promise<DocumentGenerationOutcome<{ pathname: string | null; filename: string | null }>> {
  if (candidate.candidate_track !== "experienced") {
    return { result: { pathname: null, filename: null }, auditEntries: [] };
  }

  const resolution = resolveCurrentEmployer(candidate);
  if (resolution.kind === "ambiguous") {
    throw new DocumentGenerationError(
      'Multiple employment history entries are on file and none is marked "Current employer" — mark one before initiating Step 4 (HR Background Verification).'
    );
  }
  if (resolution.kind === "none") {
    throw new DocumentGenerationError(
      "No employment history on file — add the candidate's current employer before initiating Step 4 (HR Background Verification)."
    );
  }
  if (!candidate.current_employer_hr_email) {
    throw new DocumentGenerationError(
      "No current-employer HR contact email on file — add one before initiating Step 4 (HR Background Verification)."
    );
  }

  const now = new Date().toISOString();
  try {
    const template = docTemplates.hr_bgv;
    if (!template) throw new Error('No "hr_bgv" document template configured — apply the latest schema.sql.');

    const photoDataUri = await fetchPhotoDataUri(candidate);
    const pdfBuffer = await renderOfferDocumentPdf({
      templateLabel: template.label,
      candidate,
      requisition,
      employmentEntry: resolution.entry,
      photoDataUri,
      template,
    });

    if (candidate.bgv_document_pathname) await del(candidate.bgv_document_pathname).catch(() => {});

    const pathname = `bgv-docs/${candidate.id}/${Date.now()}.pdf`;
    const blob = await put(pathname, pdfBuffer, { access: "private", contentType: "application/pdf" });
    const filename = `BGV-${candidate.candidate_code}.pdf`;

    const coveringTemplate = emailTemplates.hr_bgv;
    const vars = baseMergeVars(candidate, requisition);
    const subject = coveringTemplate ? renderTemplate(coveringTemplate.subject_template, vars) : `HR Background Verification — ${candidate.name}`;
    const emailBody = coveringTemplate
      ? renderTemplate(coveringTemplate.body_template, vars)
      : `Please find attached the background verification form for ${candidate.name}.`;

    await sendDocumentEmail(supabase, org, requisition.id, candidate.id, {
      triggerEvent: "hr_bgv_document_sent",
      recipientRole: "Current Employer HR",
      to: candidate.current_employer_hr_email,
      subject,
      body: emailBody,
      attachment: { filename, contentType: "application/pdf", content: pdfBuffer },
    });

    return {
      result: { pathname: blob.pathname, filename },
      auditEntries: [{ timestamp: now, actor, action: "HR BGV document generated & sent", details: candidate.current_employer_hr_email }],
    };
  } catch (err) {
    return {
      result: { pathname: null, filename: null },
      auditEntries: [
        {
          timestamp: now,
          actor: "System",
          action: "HR BGV document failed",
          details: err instanceof Error ? err.message : "Unknown error",
        },
      ],
    };
  }
}
