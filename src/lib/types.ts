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

export type CandidatePriority = "P1" | "P2" | "P3";
export const CANDIDATE_PRIORITIES: CandidatePriority[] = ["P1", "P2", "P3"];

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
  selected_awaiting_final_details: "Selected – Awaiting Final Details",
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

export interface Requisition {
  id: string;
  req_code: string;
  title: string;
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
}

export interface InterviewRound {
  round_name: string;
  outcome: "scheduled" | "cleared" | "rejected";
  notes?: string;
  panelist_emails?: string; // comma-separated
}

export interface EmploymentHistoryEntry {
  id: string;
  company_name: string;
  tenure_from: string;
  tenure_to: string;
  employee_code: string;
  designation: string;
  supervisor_name: string;
  email: string; // reference-check contact's official work email at this employer
}

export interface ReferenceRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  linked_employment_history_id: string | null; // null = academic/fresher reference
  verification_status: "pending" | "received" | "na";
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
  version: string;
  review_status: "pending" | "changes_requested" | "approved";
  reviewer_comments: string;
  signature_status?: "pending" | "signed"; // employee_agreement only
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
  resume_pathname: string | null;
  resume_filename: string | null;
  offer_accepted_at: string | null;
  is_demo: boolean;

  interview_rounds: InterviewRound[];
  employment_history: EmploymentHistoryEntry[];
  reference_records: ReferenceRecord[];
  reference_exception: ReferenceException;
  offer_steps: OfferStep[];
  documents: DocumentRecord[];
  offer_document_approvals: OfferDocumentApprovals;
  audit_log: AuditLogEntry[];

  created_at: string;
}

export interface OrgSettings {
  id: string;
  hr_management_emails: string | null;
  common_hr_mailbox_name: string | null;
  common_hr_mailbox_email: string | null;
  hrms_team_email: string | null;
  common_hr_gmail_connected_at: string | null;
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

export const DEFAULT_STEP_TAT_HOURS = 24;

export function defaultOfferSteps(): OfferStep[] {
  return OFFER_STEP_NAMES.map((name, i) => ({
    step_number: (i + 1) as OfferStep["step_number"],
    step_name: name,
    status: "not_started",
    owner: "",
    started_at: null,
    completed_at: null,
    tat_hours: DEFAULT_STEP_TAT_HOURS,
    grace_extensions: [],
    last_notified_tat_status: null,
  }));
}
