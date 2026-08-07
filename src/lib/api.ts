import { Candidate, PendingEmailInfo, Requisition } from "./types";

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
  createRequisition(input: Partial<Requisition> & { title: string; position_type: string; hiring_manager: string }) {
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

  createCandidate(input: Record<string, unknown>) {
    return fetch("/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
};
