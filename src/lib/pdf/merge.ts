import { Candidate, EmploymentHistoryEntry, Requisition } from "../types";

// Same spirit as baseMergeVars in notifications.ts, but sourced from a single
// EmploymentHistoryEntry (or none, for an academic/other reference) rather
// than the candidate's final offer details — a document is per-reference,
// not per-candidate.
export function buildDocumentMergeVars(
  candidate: Candidate,
  requisition: Requisition,
  employmentEntry: EmploymentHistoryEntry | null,
  referenceName?: string
): Record<string, string> {
  return {
    candidate_name: candidate.name,
    candidate_code: candidate.candidate_code,
    req_code: requisition.req_code,
    designation: candidate.final_designation ?? "",
    reference_name: referenceName ?? "",
    company_name: employmentEntry?.company_name ?? "",
    tenure_from: employmentEntry?.tenure_from ?? "",
    tenure_to: employmentEntry?.tenure_to ?? "",
    employee_code: employmentEntry?.employee_code ?? "",
    supervisor_name: employmentEntry?.supervisor_name ?? "",
  };
}
