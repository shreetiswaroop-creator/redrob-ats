export type PositionType = "experienced" | "fresher_intern";
export type RequisitionStatus = "raised" | "approved" | "fulfilled" | "on_hold" | "expired";

export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  raised: "Raised",
  approved: "Approved",
  fulfilled: "Fulfilled",
  on_hold: "On Hold",
  expired: "Expired",
};

export const REQUISITION_STATUS_ORDER: RequisitionStatus[] = ["raised", "approved", "fulfilled", "on_hold", "expired"];

// Why a requisition got archived — Fulfilled/Expired archive it immediately;
// On Hold archives it only after 15 days via sweepOnHoldArchiving.
export type RequisitionArchivedReason = "fulfilled" | "expired" | "on_hold_timeout";
export const REQUISITION_ARCHIVED_REASON_LABELS: Record<RequisitionArchivedReason, string> = {
  fulfilled: "Fulfilled",
  expired: "Expired",
  on_hold_timeout: "On Hold 15+ days",
};

// Why a candidate got archived, tied to their requisition's own archive
// reason — only requisition_on_hold candidates get a Revoke button; the
// other two are a closed chapter (position filled or given up on).
export type CandidateArchivedReason = "requisition_fulfilled" | "requisition_expired" | "requisition_on_hold";

export type CandidatePriority = "P1" | "P2" | "P3";
export const CANDIDATE_PRIORITIES: CandidatePriority[] = ["P1", "P2", "P3"];

export type HrmsHandoverStatus = "not_sent" | "awaiting_acknowledgement" | "acknowledged";
export const HRMS_HANDOVER_STATUS_LABELS: Record<HrmsHandoverStatus, string> = {
  not_sent: "Not sent",
  awaiting_acknowledgement: "Awaiting acknowledgement",
  acknowledged: "Acknowledged",
};

export type CandidateSource = "internal_referral" | "naukri" | "linkedin" | "inbound" | "other";
export const CANDIDATE_SOURCE_LABELS: Record<CandidateSource, string> = {
  internal_referral: "Internal Referral",
  naukri: "Naukri",
  linkedin: "LinkedIn",
  inbound: "Inbound",
  other: "Other",
};
export const CANDIDATE_SOURCE_ORDER: CandidateSource[] = ["internal_referral", "naukri", "linkedin", "inbound", "other"];

export type Stage =
  | "sourcing"
  | "screening"
  | "interview"
  | "selected_awaiting_final_details"
  | "offer_process"
  | "offer_accepted_completed"
  | "handover_to_hrms";

export type TatStatus = "on_track" | "at_risk" | "breached";
export type CandidateStatus = "active" | "rejected";

export type UserRole = "recruiter" | "hr_management";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  created_by: string | null;
  gmail_email: string | null;
  gmail_connected_at: string | null;
}

export const STAGE_LABELS: Record<Stage, string> = {
  sourcing: "Sourcing",
  screening: "Screening",
  interview: "Interview Round(s)",
  selected_awaiting_final_details: "Selected (Final Decision)",
  offer_process: "Offer Process",
  offer_accepted_completed: "Offer Accepted / Completed",
  handover_to_hrms: "Handover to HRMS",
};

export const STAGE_ORDER: Stage[] = [
  "sourcing",
  "screening",
  "interview",
  "selected_awaiting_final_details",
  "offer_process",
  "offer_accepted_completed",
  "handover_to_hrms",
];

// Redrob recruits and onboards on behalf of client companies (e.g. Muzig
// AI, Hanwha Vision), not just for Redrob/McKinley Rice itself.
export interface Client {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

// How urgently the ROLE needs filling — distinct from CandidatePriority
// (P1/P2/P3), which is per-candidate. Named "urgency" rather than
// "priority" specifically to avoid colliding with that existing concept.
export type RequisitionUrgency = "urgent" | "high" | "medium" | "low";
export const REQUISITION_URGENCY_ORDER: RequisitionUrgency[] = ["urgent", "high", "medium", "low"];
export const REQUISITION_URGENCY_LABELS: Record<RequisitionUrgency, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export interface Requisition {
  id: string;
  req_code: string;
  client_id: string;
  // Joined via `client:clients(name)` on read — not a real column, so it's
  // absent on a bare insert/update response unless that query re-joins it.
  client?: { name: string } | null;
  title: string;
  urgency: RequisitionUrgency;
  description: string | null;
  department: string | null;
  level: string | null;
  location: string | null;
  headcount: number;
  must_have_skills: string | null;
  budget_band: string | null;
  position_type: PositionType;
  hiring_manager: string;
  hiring_manager_email: string | null;
  status: RequisitionStatus;
  status_note: string | null;
  is_demo: boolean;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approval_skipped: boolean;
  closure_tat_days: number;

  archived: boolean;
  archived_at: string | null;
  archived_reason: RequisitionArchivedReason | null;
  on_hold_since: string | null;

  custom_fields: CustomFieldValues;
}

export interface InterviewRound {
  round_name: string;
  outcome: "scheduled" | "cleared" | "rejected";
  notes?: string;
  panelist_emails?: string; // comma-separated
  scheduled_at?: string; // set automatically when scheduled from the Interviews page
  duration_minutes?: number; // set automatically alongside scheduled_at — see Interview.duration_minutes
  mode?: InterviewMode; // set automatically alongside scheduled_at — see Interview.mode
}

export type InterviewMode = "video" | "phone" | "in_person";
export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  video: "Video",
  phone: "Phone",
  in_person: "In-person",
};

// A scheduled interview, as its own row so every candidate's interviews can
// be listed/sorted together on one page — kept in sync onto the matching
// candidate.interview_rounds entry (see InterviewsView) rather than being
// the only source of truth, since interview_rounds already existed and is
// edited directly on the candidate card too.
export interface Interview {
  id: string;
  requisition_id: string;
  candidate_id: string;
  round_number: number;
  panelist_user_ids: string[]; // references users (ATS login accounts)
  panelist_ids: string[]; // references panelists (no-login directory, e.g. hiring managers)
  scheduled_at: string;
  duration_minutes: number; // 15 | 30 | 60 — see schema check constraint
  mode: InterviewMode;
  created_by: string;
  created_at: string;
}

// A panelist who doesn't (and may never) have an ATS login — e.g. a hiring
// manager — kept separate from `users` rather than forcing an account to be
// created just to be added to an interview panel.
export interface Panelist {
  id: string;
  name: string;
  email: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

// Editable subject/body for the candidate-facing (and a couple of internal)
// notifications that used to be hardcoded strings in notifications.ts.
// {{merge_field}} tokens get substituted at send time via renderTemplate.
export interface EmailTemplate {
  id: string;
  template_key: string;
  label: string;
  subject_template: string;
  body_template: string;
  updated_by: string | null;
  updated_at: string;
}

export const EMAIL_TEMPLATE_KEYS = [
  "moved_to_screening",
  "interview_stage",
  "interview_scheduled",
  "passed_next_round",
  "passed_final_round",
  "final_details_confirmed_candidate",
  "pre_offer",
  "reference_check",
  "hr_bgv",
  "offer_letter",
  "employee_agreement",
  "step_tat_breached_candidate_reminder",
  "offer_accepted_completed_candidate",
  "rejection",
  "reconsideration",
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

// Which {{merge_field}} tokens are actually available per template, shown
// as a legend on the Email Templates page so an editor knows what they can
// insert. Offer-stage templates fire after final details are locked in
// (confirm_final_details), so designation/compensation/doj/location are
// already on the candidate record by then.
const OFFER_STAGE_MERGE_FIELDS = [
  "candidate_name",
  "candidate_code",
  "requisition_title",
  "req_code",
  "designation",
  "compensation",
  "doj",
  "location",
];
const BASIC_MERGE_FIELDS = ["candidate_name", "candidate_code", "requisition_title", "req_code"];

export const EMAIL_TEMPLATE_MERGE_FIELDS: Record<EmailTemplateKey, string[]> = {
  moved_to_screening: BASIC_MERGE_FIELDS,
  interview_stage: BASIC_MERGE_FIELDS,
  interview_scheduled: [
    ...BASIC_MERGE_FIELDS,
    "round_name",
    "interview_date",
    "interview_time",
    "duration",
    "meeting_link",
  ],
  passed_next_round: [...BASIC_MERGE_FIELDS, "round_name", "next_round_name"],
  passed_final_round: BASIC_MERGE_FIELDS,
  final_details_confirmed_candidate: OFFER_STAGE_MERGE_FIELDS,
  pre_offer: OFFER_STAGE_MERGE_FIELDS,
  reference_check: OFFER_STAGE_MERGE_FIELDS,
  hr_bgv: OFFER_STAGE_MERGE_FIELDS,
  offer_letter: [...OFFER_STAGE_MERGE_FIELDS, "doc_link"],
  employee_agreement: OFFER_STAGE_MERGE_FIELDS,
  step_tat_breached_candidate_reminder: [...BASIC_MERGE_FIELDS, "step_number", "step_name"],
  offer_accepted_completed_candidate: OFFER_STAGE_MERGE_FIELDS,
  rejection: [...BASIC_MERGE_FIELDS, "reason"],
  reconsideration: BASIC_MERGE_FIELDS,
};

export interface EmploymentHistoryEntry {
  id: string;
  company_name: string;
  tenure_from: string;
  tenure_to: string;
  employee_code: string;
  designation: string;
  supervisor_name: string;
  email: string; // reference-check contact's official work email at this employer
  is_current?: boolean; // which entry is the current employer — resolves the HR BGV (Step 4) recipient
}

export interface ReferenceRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  linked_employment_history_id: string | null; // null = academic/fresher reference
  verification_status: "pending" | "received" | "na";
  document_pathname?: string | null; // generated reference-check PDF sent to this reference
  document_sent_at?: string | null;
}

// Document-generation engine (PRD §7.5, §7.7) — HR-editable, merge-field-
// annotated templates for the Reference Check and HR BGV documents generated
// and emailed at Step 2 / Step 4 initiation. See src/lib/pdf/OfferDocumentPdf.tsx
// and src/lib/document-generation.ts.
export interface DocumentSectionQuestion {
  id: string;
  prompt_template: string;
}

export interface DocumentTemplate {
  id: string;
  template_key: string;
  label: string;
  section_a_intro: string;
  section_a_questions: DocumentSectionQuestion[];
  section_b_text: string;
  section_c_note: string;
  updated_by: string | null;
  updated_at: string;
}

export const DOCUMENT_TEMPLATE_KEYS = ["reference_check_professional", "reference_check_fresher_intern", "hr_bgv"] as const;
export type DocumentTemplateKey = (typeof DOCUMENT_TEMPLATE_KEYS)[number];

// Same merge-field set across all 3 templates — the underlying data is
// always one EmploymentHistoryEntry (or none, for an academic/other
// reference) regardless of track; track-specific wording lives in each
// template's own prose, not in different token names.
const DOCUMENT_MERGE_FIELDS = [
  "candidate_name",
  "candidate_code",
  "req_code",
  "designation",
  "reference_name",
  "company_name",
  "tenure_from",
  "tenure_to",
  "employee_code",
  "supervisor_name",
];
export const DOCUMENT_TEMPLATE_MERGE_FIELDS: Record<DocumentTemplateKey, string[]> = {
  reference_check_professional: DOCUMENT_MERGE_FIELDS,
  reference_check_fresher_intern: DOCUMENT_MERGE_FIELDS,
  hr_bgv: DOCUMENT_MERGE_FIELDS,
};

// Interview round numbers map to a fixed name (shown on the Interviews page
// and used in candidate-facing email copy) — shared between the client
// (InterviewsView) and the server (/api/interviews route) so both derive
// the same name from a round_number.
export const INTERVIEW_ROUND_NAMES: Record<number, string> = {
  1: "Discovery call",
  2: "Expertise round 1",
  3: "Expertise round 2",
  4: "Discussion round",
  5: "Panel round",
};
export function deriveInterviewRoundName(roundNumber: number): string {
  return INTERVIEW_ROUND_NAMES[roundNumber] ?? `Round ${roundNumber}`;
}

// Reverse lookup for the "needs another round" email — best-effort: a
// manually-typed round name (e.g. "L1", "Managerial") that doesn't match
// one of the 5 fixed names has no known "next" round, so this falls back
// to generic wording rather than guessing a number.
export function deriveNextRoundName(currentRoundName: string): string {
  const currentNumber = Object.entries(INTERVIEW_ROUND_NAMES).find(([, name]) => name === currentRoundName)?.[0];
  if (!currentNumber) return "the next round";
  return INTERVIEW_ROUND_NAMES[Number(currentNumber) + 1] ?? "the next round";
}

export const OFFER_STEP_NAMES = [
  "Pre-Offer Formalities",
  "Reference Check",
  "Offer Letter Issuance",
  "HR Background Verification (BGV)",
  "Employee Agreement",
] as const;

export interface GraceExtension {
  status: "pending" | "approved" | "denied";
  requested_by: string;
  reason: string;
  requested_at: string;
  requested_tat_hours: number; // new total TAT hours (from step start), not additional hours
  decided_by?: string;
  decided_at?: string;
  decision_note?: string;
}

export type StepTatStatus = "on_track" | "at_risk" | "breached";

export interface OfferStep {
  step_number: 1 | 2 | 3 | 4 | 5;
  step_name: string;
  status: "not_started" | "in_progress" | "complete" | "na";
  owner: string;
  started_at: string | null;
  completed_at: string | null;
  tat_hours: number;
  grace_extensions: GraceExtension[];
  last_notified_tat_status?: StepTatStatus | null;
  notes?: string;
}

export interface ReferenceException {
  status: "none" | "pending" | "approved" | "denied";
  requested_by?: string;
  reason?: string;
  requested_at?: string;
  decided_by?: string;
  decided_at?: string;
}

export interface DocumentRecord {
  id: string;
  category:
    | "education_proof"
    | "id_proof"
    | "salary_slip"
    | "passport_photo"
    | "reference_response"
    | "offer_letter_draft"
    | "signed_offer_letter"
    | "bgv_response"
    | "employee_agreement_draft"
    | "signed_agreement";
  name: string;
  link_or_note: string;
  uploaded_at: string;
}

export interface OfferDocumentApproval {
  // Google Docs/Word link the recruiter shares for review — replaces
  // file-upload as the underlying draft's location. version is an
  // auto-incrementing revision counter (bumped whenever review_status
  // transitions into "pending"), not something the recruiter types.
  doc_link: string;
  version: string;
  review_status: "pending" | "changes_requested" | "approved";
  reviewer_comments: string;
  signature_status?: "pending" | "signed"; // employee_agreement only
  // Employee Agreement only — one field, uploaded twice: once by the
  // recruiter (final pre-signature PDF, once content is approved) and once
  // by HR Management (re-uploaded as the signed copy, same field).
  final_pdf_pathname?: string | null;
  final_pdf_filename?: string | null;
}

export interface OfferDocumentApprovals {
  offer_letter?: OfferDocumentApproval;
  employee_agreement?: OfferDocumentApproval;
}

export interface AuditLogEntry {
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
}

// A lightweight, timestamped/attributed free-text note — distinct from the
// single structured `notes` field captured at intake. Feeds the unified
// activity timeline (CandidateDetailPanel) alongside audit_log.
export interface CandidateNote {
  author: string;
  text: string;
  created_at: string;
}

export interface Candidate {
  id: string;
  candidate_code: string;
  requisition_id: string;

  name: string;
  phone: string | null;
  personal_email: string | null;

  owner: string;
  owner_email: string | null;
  candidate_track: PositionType;
  track_override_reason: string | null;
  hiring_manager: string | null;

  current_stage: Stage;
  stage_entered_at: string;
  tat_status: TatStatus;

  status: CandidateStatus;
  rejected_from_stage: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;

  final_compensation: string | null;
  final_doj: string | null;
  final_designation: string | null;
  final_location: string | null;
  final_benefits: string | null;
  final_notes: string | null;
  final_details_locked: boolean;

  current_employer_hr_email: string | null;

  manual_followup_note: string | null;
  manual_followup_since: string | null;

  hrms_handover_status: HrmsHandoverStatus | null;
  hrms_handed_off_at: string | null;
  hrms_acknowledged_at: string | null;

  priority: CandidatePriority | null;
  on_hold: boolean;
  on_hold_note: string | null;
  on_hold_since: string | null;

  notice_period: string | null;
  current_ctc: string | null;
  expected_ctc: string | null;
  current_location: string | null;
  source: CandidateSource | null;
  relevant_experience_years: number | null;
  notes: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  reason_for_change: string | null;
  resume_pathname: string | null;
  resume_filename: string | null;
  photo_pathname: string | null;
  photo_filename: string | null;
  education_proof_pathname: string | null;
  education_proof_filename: string | null;
  id_proof_pathname: string | null;
  id_proof_filename: string | null;
  salary_slip_pathname: string | null;
  salary_slip_filename: string | null;
  bgv_document_pathname: string | null;
  bgv_document_filename: string | null;
  offer_accepted_at: string | null;
  is_demo: boolean;

  archived: boolean;
  archived_at: string | null;
  archived_reason: CandidateArchivedReason | null;

  interview_rounds: InterviewRound[];
  employment_history: EmploymentHistoryEntry[];
  reference_records: ReferenceRecord[];
  reference_exception: ReferenceException;
  offer_steps: OfferStep[];
  documents: DocumentRecord[];
  offer_document_approvals: OfferDocumentApprovals;
  audit_log: AuditLogEntry[];
  candidate_notes: CandidateNote[];

  consent_given: boolean;
  consent_given_at: string | null;

  custom_fields: CustomFieldValues;

  created_at: string;
}

// B2.1 — admin-configurable fields on Candidate/Requisition (see
// custom_field_definitions in supabase/schema.sql). Values live in one JSONB
// blob per entity, keyed by field_key; definitions carry the label/type/
// validation rules used to render and validate that blob.
export type CustomFieldEntityType = "candidate" | "requisition";
export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";
export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ["text", "number", "date", "boolean", "select"];
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes/No",
  select: "Select (dropdown)",
};

export type CustomFieldValues = Record<string, string | number | boolean | null>;

export interface CustomFieldDefinition {
  id: string;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  select_options: string[] | null;
  required: boolean;
  display_order: number;
  created_by: string;
  created_at: string;
}

// Surfaced as a warn-don't-block popup when adding a candidate whose
// phone/email already exists elsewhere in the database (any requisition).
export interface CandidateDuplicateMatch {
  candidate_code: string;
  name: string;
  requisition_title: string | null;
  req_code: string | null;
  shortlisted_on: string;
  stage: Stage;
  status: CandidateStatus;
  rejection_reason: string | null;
  on_hold: boolean;
  on_hold_note: string | null;
}

export interface OrgSettings {
  id: string;
  hr_management_emails: string | null;
  common_hr_mailbox_name: string | null;
  common_hr_mailbox_email: string | null;
  hrms_team_email: string | null;
  common_hr_gmail_connected_at: string | null;
  live_sending_enabled: boolean;
  default_step_tat_hours: number;
  logo_url: string | null;
}

export interface NotificationRecipient {
  role: string; // e.g. "Candidate", "Hiring Manager", "Recruiter", "Common HR Mailbox"
  name: string | null;
  email: string | null;
}

export type NotificationStatus = "pending" | "sent" | "cancelled" | "failed";

export interface PendingEmailInfo {
  id: string;
  subject: string;
  scheduled_send_at: string;
}

export interface NotificationLogEntry {
  id: string;
  trigger_event: string;
  requisition_id: string | null;
  candidate_id: string | null;
  recipients: NotificationRecipient[];
  subject: string;
  body: string;
  sent_via: string;
  status: NotificationStatus;
  scheduled_send_at: string | null;
  sent_at: string | null;
  sender_mailbox: string | null;
  gmail_message_id: string | null;
  cancel_reason: string | null;
  is_correction: boolean;
  created_at: string;
}

// Fallback only — for malformed/incomplete step data (see src/lib/tat.ts).
// New candidates get the org's configured default_step_tat_hours instead
// (Settings → TAT Defaults), passed into defaultOfferSteps() below.
export const DEFAULT_STEP_TAT_HOURS = 24;

export function defaultOfferSteps(tatHours: number = DEFAULT_STEP_TAT_HOURS): OfferStep[] {
  return OFFER_STEP_NAMES.map((name, i) => ({
    step_number: (i + 1) as OfferStep["step_number"],
    step_name: name,
    status: "not_started",
    owner: "",
    started_at: null,
    completed_at: null,
    tat_hours: tatHours,
    grace_extensions: [],
    last_notified_tat_status: null,
  }));
}
