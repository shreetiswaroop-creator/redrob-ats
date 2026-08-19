import { AppUser, Candidate, CandidateDuplicateMatch, Client, CustomFieldDefinition, CustomFieldEntityType, DocumentTemplate, EmailTemplate, Interview, InterviewMode, Panelist, PendingEmailInfo, Requisition } from "./types";
import { PendingApprovalItem } from "./pendingApprovals";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// None of these take an "actor" parameter — the server derives who's acting
// from the verified session cookie (src/lib/session.ts), not from anything
// the client sends. A logged-in user can't claim to be someone else.
export const api = {
  createRequisition(input: Partial<Requisition> & { title: string; position_type: string; hiring_manager: string; client_id: string }) {
    return fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => handle<Requisition>(r));
  },

  setRequisitionStatus(id: string, status: string, note?: string) {
    return fetch(`/api/requisitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", status, note }),
    }).then((r) => handle<Requisition>(r));
  },

  updateRequisitionClosureTat(id: string, closureTatDays: number) {
    return fetch(`/api/requisitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_closure_tat", closure_tat_days: closureTatDays }),
    }).then((r) => handle<Requisition>(r));
  },

  updateRequisitionDetails(id: string, fields: { urgency?: string; description?: string; custom_fields?: Record<string, unknown> }) {
    return fetch(`/api/requisitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_details", ...fields }),
    }).then((r) => handle<Requisition>(r));
  },

  createCandidate(input: Record<string, unknown>): Promise<Candidate | { duplicate: true; matches: CandidateDuplicateMatch[] }> {
    return fetch("/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(async (r) => {
      if (r.status === 409) {
        const body = await r.json().catch(() => ({}));
        if (body?.duplicate) return { duplicate: true as const, matches: (body.matches as CandidateDuplicateMatch[]) ?? [] };
      }
      return handle<Candidate>(r);
    });
  },

  listRequisitions(params?: { archived?: boolean }) {
    const qs = params?.archived !== undefined ? `?archived=${params.archived}` : "";
    return fetch(`/api/requisitions${qs}`).then((r) => handle<Requisition[]>(r));
  },

  listCandidatesForRequisition(requisitionId: string) {
    return fetch(`/api/candidates?requisition_id=${requisitionId}`).then((r) => handle<Candidate[]>(r));
  },

  revokeRequisition(id: string) {
    return fetch(`/api/requisitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    }).then((r) => handle<Requisition>(r));
  },

  revokeCandidate(id: string, requisitionId?: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", requisition_id: requisitionId }),
    }).then((r) => handle<Candidate>(r));
  },

  uploadResume(id: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/candidates/${id}/resume`, { method: "POST", body: formData }).then((r) => handle<Candidate>(r));
  },

  deleteResume(id: string) {
    return fetch(`/api/candidates/${id}/resume`, { method: "DELETE" }).then((r) => handle<Candidate>(r));
  },

  uploadPhoto(id: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/candidates/${id}/photo`, { method: "POST", body: formData }).then((r) => handle<Candidate>(r));
  },

  deletePhoto(id: string) {
    return fetch(`/api/candidates/${id}/photo`, { method: "DELETE" }).then((r) => handle<Candidate>(r));
  },

  uploadCandidateDocument(id: string, kind: "education_proof" | "id_proof" | "salary_slip", file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/candidates/${id}/documents/${kind}`, { method: "POST", body: formData }).then((r) => handle<Candidate>(r));
  },

  deleteCandidateDocument(id: string, kind: "education_proof" | "id_proof" | "salary_slip") {
    return fetch(`/api/candidates/${id}/documents/${kind}`, { method: "DELETE" }).then((r) => handle<Candidate>(r));
  },

  moveCandidateStage(id: string, toStage: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move_stage", to_stage: toStage }),
    }).then((r) => handle<Candidate>(r));
  },

  rejectCandidate(id: string, reason: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", rejection_reason: reason }),
    }).then((r) => handle<Candidate>(r));
  },

  restoreCandidate(id: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    }).then((r) => handle<Candidate>(r));
  },

  cancelPendingEmail(notificationId: string) {
    return fetch(`/api/notifications/${notificationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    }).then((r) => handle<{ ok: true }>(r));
  },

  clearFollowupFlag(id: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_followup_flag" }),
    }).then((r) => handle<Candidate>(r));
  },

  getPendingEmail(candidateId: string) {
    return fetch(`/api/candidates/${candidateId}/pending-email`).then((r) =>
      handle<{ pendingEmail: PendingEmailInfo | null }>(r)
    );
  },

  setCandidateOnHold(id: string, note: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_on_hold", note }),
    }).then((r) => handle<Candidate>(r));
  },

  clearCandidateOnHold(id: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_on_hold" }),
    }).then((r) => handle<Candidate>(r));
  },

  confirmFinalDetails(
    id: string,
    details: {
      final_compensation: string;
      final_doj: string;
      final_designation: string;
      final_location: string;
      final_benefits?: string;
      final_notes?: string;
    }
  ) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm_final_details", ...details }),
    }).then((r) => handle<Candidate>(r));
  },

  updateCandidateFields(id: string, fields: Record<string, unknown>) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_fields", fields }),
    }).then((r) => handle<Candidate>(r));
  },

  requestReferenceException(id: string, reason: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_reference_exception", reason }),
    }).then((r) => handle<Candidate>(r));
  },

  decideReferenceException(id: string, decision: "approved" | "denied") {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decide_reference_exception", decision }),
    }).then((r) => handle<Candidate>(r));
  },

  requestGraceExtension(id: string, stepNumber: number, requestedTatHours: number, reason: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request_grace_extension",
        step_number: stepNumber,
        requested_tat_hours: requestedTatHours,
        reason,
      }),
    }).then((r) => handle<Candidate>(r));
  },

  decideGraceExtension(id: string, stepNumber: number, decision: "approved" | "denied", decisionNote?: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "decide_grace_extension",
        step_number: stepNumber,
        decision,
        decision_note: decisionNote,
      }),
    }).then((r) => handle<Candidate>(r));
  },

  listInterviews() {
    return fetch("/api/interviews").then((r) => handle<Interview[]>(r));
  },

  createInterview(input: {
    requisition_id: string;
    candidate_id: string;
    round_number: number;
    panelist_user_ids: string[];
    panelist_ids: string[];
    scheduled_at: string;
    duration_minutes: number;
    mode: InterviewMode;
    meeting_link?: string;
  }) {
    return fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => handle<Interview>(r));
  },

  notifyNextRound(id: string, roundName: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "notify_next_round", round_name: roundName }),
    }).then((r) => handle<Candidate>(r));
  },

  markHrmsAcknowledged(id: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_hrms_acknowledged" }),
    }).then((r) => handle<Candidate>(r));
  },

  addCandidateNote(id: string, text: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_note", text }),
    }).then((r) => handle<Candidate>(r));
  },

  listPanelists() {
    return fetch("/api/panelists").then((r) => handle<Panelist[]>(r));
  },

  createPanelist(input: { name: string; email?: string }) {
    return fetch("/api/panelists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => handle<Panelist>(r));
  },

  // Archives the panelist (see the route) rather than removing the row.
  deletePanelist(id: string) {
    return fetch(`/api/panelists/${id}`, { method: "DELETE" }).then((r) => handle<Panelist>(r));
  },

  listEmailTemplates() {
    return fetch("/api/email-templates").then((r) => handle<EmailTemplate[]>(r));
  },

  updateEmailTemplate(key: string, input: { subject_template: string; body_template: string }) {
    return fetch(`/api/email-templates/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => handle<EmailTemplate>(r));
  },

  listDocumentTemplates() {
    return fetch("/api/document-templates").then((r) => handle<DocumentTemplate[]>(r));
  },

  uploadEmployeeAgreementPdf(id: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/candidates/${id}/employee-agreement-pdf`, { method: "POST", body: formData }).then((r) => handle<Candidate>(r));
  },

  listClients() {
    return fetch("/api/clients").then((r) => handle<Client[]>(r));
  },

  createClient(name: string) {
    return fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => handle<Client>(r));
  },

  updateDocumentTemplate(
    key: string,
    input: {
      section_a_intro: string;
      section_a_questions: DocumentTemplate["section_a_questions"];
      section_b_text: string;
      section_c_note: string;
    }
  ) {
    return fetch(`/api/document-templates/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => handle<DocumentTemplate>(r));
  },

  listCustomFields(entityType?: CustomFieldEntityType) {
    const qs = entityType ? `?entity_type=${entityType}` : "";
    return fetch(`/api/custom-fields${qs}`).then((r) => handle<CustomFieldDefinition[]>(r));
  },

  createCustomField(input: {
    entity_type: CustomFieldEntityType;
    label: string;
    field_type: CustomFieldDefinition["field_type"];
    select_options?: string[];
    required: boolean;
  }) {
    return fetch("/api/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => handle<CustomFieldDefinition>(r));
  },

  updateCustomField(
    id: string,
    input: Partial<Pick<CustomFieldDefinition, "label" | "required" | "select_options" | "display_order">>
  ) {
    return fetch(`/api/custom-fields/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => handle<CustomFieldDefinition>(r));
  },

  // Returns { deleted: true } on success, or { deleted: false, count } if the
  // field has existing data and the caller hasn't confirmed past that yet.
  deleteCustomField(id: string, confirm?: boolean): Promise<{ deleted: true } | { deleted: false; count: number }> {
    const qs = confirm ? "?confirm=true" : "";
    return fetch(`/api/custom-fields/${id}${qs}`, { method: "DELETE" }).then(async (r) => {
      if (r.status === 409) {
        const body = await r.json().catch(() => ({}));
        return { deleted: false as const, count: (body.count as number) ?? 0 };
      }
      await handle<{ ok: true }>(r);
      return { deleted: true as const };
    });
  },

  listPendingApprovals() {
    return fetch("/api/pending-approvals").then((r) => handle<{ items: PendingApprovalItem[] }>(r));
  },

  listActiveUsers() {
    return fetch("/api/users").then((r) => handle<AppUser[]>(r)).then((users) => users.filter((u) => !u.deactivated_at));
  },

  reassignCandidateOwner(id: string, newOwnerId: string) {
    return fetch(`/api/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign_owner", new_owner_id: newOwnerId }),
    }).then((r) => handle<Candidate>(r));
  },
};
