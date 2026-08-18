import { Candidate, Requisition } from "./types";

export type PendingApprovalType =
  | "requisition_approval"
  | "reference_exception"
  | "grace_extension"
  | "offer_letter_review"
  | "employee_agreement_review";

export const PENDING_APPROVAL_TYPE_LABELS: Record<PendingApprovalType, string> = {
  requisition_approval: "Requisition approval",
  reference_exception: "Reference exception",
  grace_extension: "Grace extension",
  offer_letter_review: "Offer Letter review",
  employee_agreement_review: "Employee Agreement review",
};

export interface PendingApprovalItem {
  type: PendingApprovalType;
  typeLabel: string;
  title: string; // who/what this is about, e.g. "REQ1005 — Senior Backend Engineer" or "Rohan Sharma (CAND4009)"
  subtitle: string | null; // secondary context, e.g. the requisition a candidate-level item belongs to
  waitingSince: string; // ISO timestamp — oldest-waiting-first is the default sort
  href: string;
}

// Every candidate-level item links into the live Pipeline board via
// ?candidate=<id> (BoardApp.tsx opens that candidate's detail panel on
// load), the same query-param-deep-link convention the Dashboard's
// "Pending your approval" tile already established with ?status=raised —
// not a second, unrelated deep-linking mechanism.
function candidateHref(candidateId: string): string {
  return `/pipeline?candidate=${candidateId}`;
}

export function computePendingApprovals(requisitions: Requisition[], candidates: Candidate[]): PendingApprovalItem[] {
  const items: PendingApprovalItem[] = [];
  const requisitionById = new Map(requisitions.map((r) => [r.id, r]));

  for (const r of requisitions) {
    if (r.status === "raised") {
      items.push({
        type: "requisition_approval",
        typeLabel: PENDING_APPROVAL_TYPE_LABELS.requisition_approval,
        title: `${r.req_code} — ${r.title}`,
        subtitle: null,
        waitingSince: r.created_at,
        href: "/pipeline?status=raised",
      });
    }
  }

  for (const c of candidates) {
    if (c.archived) continue; // not actionable off the live board
    const req = requisitionById.get(c.requisition_id);
    const reqLabel = req ? `${req.req_code} — ${req.title}` : "Unknown requisition";
    const candidateLabel = `${c.name} (${c.candidate_code})`;
    const href = candidateHref(c.id);

    if (c.reference_exception?.status === "pending") {
      items.push({
        type: "reference_exception",
        typeLabel: PENDING_APPROVAL_TYPE_LABELS.reference_exception,
        title: candidateLabel,
        subtitle: reqLabel,
        waitingSince: c.reference_exception.requested_at ?? c.created_at,
        href,
      });
    }

    for (const step of c.offer_steps ?? []) {
      for (const grace of step.grace_extensions ?? []) {
        if (grace.status === "pending") {
          items.push({
            type: "grace_extension",
            typeLabel: PENDING_APPROVAL_TYPE_LABELS.grace_extension,
            title: candidateLabel,
            subtitle: `${reqLabel} — ${step.step_name}`,
            waitingSince: grace.requested_at,
            href,
          });
        }
      }
    }

    const approvals = c.offer_document_approvals;
    if (approvals?.offer_letter?.review_status === "pending") {
      items.push({
        type: "offer_letter_review",
        typeLabel: PENDING_APPROVAL_TYPE_LABELS.offer_letter_review,
        title: candidateLabel,
        subtitle: reqLabel,
        waitingSince: approvals.offer_letter.submitted_at ?? c.created_at,
        href,
      });
    }
    if (approvals?.employee_agreement?.review_status === "pending") {
      items.push({
        type: "employee_agreement_review",
        typeLabel: PENDING_APPROVAL_TYPE_LABELS.employee_agreement_review,
        title: candidateLabel,
        subtitle: reqLabel,
        waitingSince: approvals.employee_agreement.submitted_at ?? c.created_at,
        href,
      });
    }
  }

  return items.sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
}

export function formatWaitingSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h waiting`;
  const days = Math.round(hours / 24);
  return `${days}d waiting`;
}
