import {
  Candidate,
  CandidatePriority,
  CANDIDATE_PRIORITIES,
  CandidateSource,
  CANDIDATE_SOURCE_LABELS,
  CANDIDATE_SOURCE_ORDER,
  Requisition,
  REQUISITION_STATUS_LABELS,
  REQUISITION_STATUS_ORDER,
  Stage,
  STAGE_LABELS,
  STAGE_ORDER,
  TatStatus,
} from "./types";
import { computeClosureTatStatus } from "./tat";

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface DaysItem {
  key: string;
  label: string;
  days: number;
}

export interface TimeToFillEntry {
  requisitionId: string;
  reqCode: string;
  title: string;
  days: number;
}

export interface SourceEffectivenessEntry {
  key: string;
  label: string;
  sourced: number;
  hired: number;
  ratePercent: number | null;
}

export interface AgingRequisitionEntry {
  requisitionId: string;
  reqCode: string;
  title: string;
  daysOpen: number;
}

export interface DashboardMetrics {
  openPositions: number;
  requisitionsPendingApproval: number;
  totalRequisitions: number;
  activeCandidates: number;
  rejectedCandidates: number;
  inOfferProcess: number;
  onHoldCandidates: number;
  tatBreached: number;
  requisitionsPastClosureTat: number;
  experiencedCandidates: number;
  fresherInternCandidates: number;

  requisitionStatusBreakdown: CountItem[];
  candidatesByStage: CountItem[];
  rejectedCount: number;
  tatBreakdown: CountItem[];
  priorityBreakdown: CountItem[];
  departmentBreakdown: CountItem[];

  avgTimeToFillDays: number | null;
  timeToFillByRequisition: TimeToFillEntry[];
  avgTimePerStage: DaysItem[];
  offerAcceptance: { sent: number; accepted: number; ratePercent: number | null };
  sourceEffectiveness: SourceEffectivenessEntry[];
  agingRequisitions: AgingRequisitionEntry[];
  recruiterLoad: CountItem[];
}

const DEPARTMENT_OTHER_CAP = 6;
const AGING_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const OFFER_OR_LATER_STAGES = new Set<Stage>(["offer_process", "offer_accepted_completed", "handover_to_hrms"]);

// Factored out so callers that only need this one breakdown (e.g. the
// compact chart above the Kanban board) don't have to run the whole
// dashboard-wide computation just to get it.
export function computeCandidatesByStage(activeCandidates: Candidate[]): CountItem[] {
  return STAGE_ORDER.map((stage: Stage) => ({
    key: stage,
    label: STAGE_LABELS[stage],
    count: activeCandidates.filter((c) => c.current_stage === stage).length,
  }));
}

export function computeDashboardMetrics(requisitions: Requisition[], candidates: Candidate[]): DashboardMetrics {
  const activeCandidatesList = candidates.filter((c) => c.status === "active");
  const rejectedCandidatesList = candidates.filter((c) => c.status === "rejected");

  const openPositions = requisitions.filter((r) => r.status === "approved" || r.status === "on_hold").length;
  const requisitionsPendingApproval = requisitions.filter((r) => r.status === "raised").length;

  const requisitionStatusBreakdown: CountItem[] = REQUISITION_STATUS_ORDER.map((status) => ({
    key: status,
    label: REQUISITION_STATUS_LABELS[status],
    count: requisitions.filter((r) => r.status === status).length,
  }));

  const candidatesByStage: CountItem[] = computeCandidatesByStage(activeCandidatesList);

  const tatOrder: TatStatus[] = ["on_track", "at_risk", "breached"];
  const tatLabels: Record<TatStatus, string> = { on_track: "On track", at_risk: "At risk", breached: "Breached" };
  const tatBreakdown: CountItem[] = tatOrder.map((status) => ({
    key: status,
    label: tatLabels[status],
    count: activeCandidatesList.filter((c) => c.tat_status === status).length,
  }));

  const priorityBreakdown: CountItem[] = [
    ...CANDIDATE_PRIORITIES.map((p: CandidatePriority) => ({
      key: p,
      label: p,
      count: activeCandidatesList.filter((c) => c.priority === p).length,
    })),
    { key: "none", label: "Unset", count: activeCandidatesList.filter((c) => !c.priority).length },
  ];

  const deptCounts = new Map<string, number>();
  for (const r of requisitions) {
    const dept = r.department?.trim() || "Unspecified";
    deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
  }
  const sortedDepts = [...deptCounts.entries()].sort((a, b) => b[1] - a[1]);
  const departmentBreakdown: CountItem[] = sortedDepts.slice(0, DEPARTMENT_OTHER_CAP).map(([dept, count]) => ({
    key: dept,
    label: dept,
    count,
  }));
  if (sortedDepts.length > DEPARTMENT_OTHER_CAP) {
    const otherCount = sortedDepts.slice(DEPARTMENT_OTHER_CAP).reduce((sum, [, count]) => sum + count, 0);
    departmentBreakdown.push({ key: "other", label: "Other", count: otherCount });
  }

  const now = new Date();

  // Time to Fill: requisition raised -> the earliest candidate for it
  // reaching Offer Accepted (candidates.offer_accepted_at, set automatically
  // on stage entry — see the move_stage handler).
  const timeToFillByRequisition: TimeToFillEntry[] = [];
  for (const req of requisitions) {
    const acceptedDates = candidates
      .filter((c) => c.requisition_id === req.id && c.offer_accepted_at)
      .map((c) => new Date(c.offer_accepted_at as string).getTime());
    if (acceptedDates.length === 0) continue;
    const earliest = Math.min(...acceptedDates);
    const days = Math.round(((earliest - new Date(req.created_at).getTime()) / MS_PER_DAY) * 10) / 10;
    timeToFillByRequisition.push({ requisitionId: req.id, reqCode: req.req_code, title: req.title, days: Math.max(0, days) });
  }
  timeToFillByRequisition.sort((a, b) => b.days - a.days);
  const avgTimeToFillDays =
    timeToFillByRequisition.length > 0
      ? Math.round((timeToFillByRequisition.reduce((sum, e) => sum + e.days, 0) / timeToFillByRequisition.length) * 10) / 10
      : null;

  // Average time spent per stage: how long, on average, candidates CURRENTLY
  // sitting in each stage have been there — surfaces where the pipeline is
  // bottlenecked right now, not a historical average across everyone who
  // ever passed through.
  const avgTimePerStage: DaysItem[] = STAGE_ORDER.map((stage) => {
    const inStage = activeCandidatesList.filter((c) => c.current_stage === stage);
    const avgDays =
      inStage.length > 0
        ? inStage.reduce((sum, c) => sum + (now.getTime() - new Date(c.stage_entered_at).getTime()) / MS_PER_DAY, 0) /
          inStage.length
        : 0;
    return { key: stage, label: STAGE_LABELS[stage], days: Math.round(avgDays * 10) / 10 };
  });

  // Offer acceptance rate: "sent" = ever reached Offer Process or later
  // (inferred — there's no discrete "offer sent" event logged today);
  // "accepted" = offer_accepted_at is set, the authoritative signal.
  const everInOfferProcess = candidates.filter(
    (c) =>
      !!c.offer_accepted_at ||
      (c.status === "active" && OFFER_OR_LATER_STAGES.has(c.current_stage)) ||
      (c.status === "rejected" && !!c.rejected_from_stage && OFFER_OR_LATER_STAGES.has(c.rejected_from_stage as Stage))
  );
  const acceptedCandidates = candidates.filter((c) => !!c.offer_accepted_at);
  const offerAcceptance = {
    sent: everInOfferProcess.length,
    accepted: acceptedCandidates.length,
    ratePercent: everInOfferProcess.length > 0 ? Math.round((acceptedCandidates.length / everInOfferProcess.length) * 100) : null,
  };

  // Source effectiveness — needs the Source field, so counts are 0 until
  // candidates start carrying it going forward (or via seeded demo data).
  const sourceEffectiveness: SourceEffectivenessEntry[] = CANDIDATE_SOURCE_ORDER.map((source: CandidateSource) => {
    const sourced = candidates.filter((c) => c.source === source);
    const hired = sourced.filter((c) => !!c.offer_accepted_at);
    return {
      key: source,
      label: CANDIDATE_SOURCE_LABELS[source],
      sourced: sourced.length,
      hired: hired.length,
      ratePercent: sourced.length > 0 ? Math.round((hired.length / sourced.length) * 100) : null,
    };
  });

  // Requisition aging: still open (not Fulfilled/Expired) and raised more
  // than 30 days ago.
  const agingRequisitions: AgingRequisitionEntry[] = requisitions
    .filter((r) => r.status === "raised" || r.status === "approved" || r.status === "on_hold")
    .map((r) => ({
      requisitionId: r.id,
      reqCode: r.req_code,
      title: r.title,
      daysOpen: Math.round((now.getTime() - new Date(r.created_at).getTime()) / MS_PER_DAY),
    }))
    .filter((r) => r.daysOpen > AGING_THRESHOLD_DAYS)
    .sort((a, b) => b.daysOpen - a.daysOpen);

  // Recruiter-wise active candidate load.
  const recruiterCounts = new Map<string, number>();
  for (const c of activeCandidatesList) {
    const owner = c.owner?.trim() || "Unassigned";
    recruiterCounts.set(owner, (recruiterCounts.get(owner) ?? 0) + 1);
  }
  const recruiterLoad: CountItem[] = [...recruiterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([owner, count]) => ({ key: owner, label: owner, count }));

  return {
    openPositions,
    requisitionsPendingApproval,
    totalRequisitions: requisitions.length,
    activeCandidates: activeCandidatesList.length,
    rejectedCandidates: rejectedCandidatesList.length,
    inOfferProcess: activeCandidatesList.filter(
      (c) => c.current_stage === "offer_process" || c.current_stage === "offer_accepted_completed"
    ).length,
    onHoldCandidates: activeCandidatesList.filter((c) => c.on_hold).length,
    tatBreached: activeCandidatesList.filter((c) => c.tat_status === "breached").length,
    // Distinct from tatBreached above — this is the requisition-level
    // closure TAT (days since approval vs. closure_tat_days), not the
    // per-candidate offer-step TAT. See computeClosureTatStatus in tat.ts.
    requisitionsPastClosureTat: requisitions.filter((r) => computeClosureTatStatus(r) === "breached").length,
    experiencedCandidates: activeCandidatesList.filter((c) => c.candidate_track === "experienced").length,
    fresherInternCandidates: activeCandidatesList.filter((c) => c.candidate_track === "fresher_intern").length,

    requisitionStatusBreakdown,
    candidatesByStage,
    rejectedCount: rejectedCandidatesList.length,
    tatBreakdown,
    priorityBreakdown,
    departmentBreakdown,

    avgTimeToFillDays,
    timeToFillByRequisition,
    avgTimePerStage,
    offerAcceptance,
    sourceEffectiveness,
    agingRequisitions,
    recruiterLoad,
  };
}
