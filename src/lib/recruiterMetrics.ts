import { Candidate, Requisition, STAGE_LABELS, Stage, STAGE_ORDER } from "./types";
import { computeStepTatStatus } from "./tat";
import { CountItem, DaysItem } from "./dashboardMetrics";

export type DateRangeKey = "7d" | "30d" | "90d" | "all";

// Mirrors DashboardView's own DATE_RANGE_OPTIONS/DateRangeKey exactly (not
// imported from there — that file intentionally isn't touched by this
// feature) so both new pages offer the identical 4 choices.
export const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function cutoffFor(range: DateRangeKey): number | null {
  const option = DATE_RANGE_OPTIONS.find((o) => o.key === range)!;
  return option.days === null ? null : Date.now() - option.days * MS_PER_DAY;
}

function inPeriod(dateStr: string | null | undefined, cutoff: number | null): boolean {
  if (!dateStr) return false;
  if (cutoff === null) return true;
  return new Date(dateStr).getTime() >= cutoff;
}

export interface StageRejectionEntry extends CountItem {
  percent: number | null;
}

export interface RecruiterMetrics {
  owner: string;

  // Current-state snapshot — NOT affected by the selected date range, same
  // as recruiterLoad/avgTimePerStage on the org-wide Dashboard already
  // aren't semantically "point in time" filtered by creation date.
  activePipelineSize: number;
  avgTimePerStage: DaysItem[];
  offerAcceptance: { sent: number; accepted: number; ratePercent: number | null };
  rejectedTotal: number;
  rejectionByStage: StageRejectionEntry[];
  tatAdherence: { completedSteps: number; onTrackSteps: number; adherencePercent: number | null };
  documentationCompleteness: {
    rejectionReasonPercent: number | null;
    employmentHistoryPercent: number | null;
  };

  // Period-scoped — recomputed for whichever DateRangeKey is passed in.
  requisitionsClosedInPeriod: number;
  avgTimeToFillDays: number | null;
  candidatesSourcedInPeriod: number;
  candidatesScreenedInPeriod: number;
  graceExtensionsRequestedInPeriod: number;
  timeToFirstActionHours: number | null;
}

export function emptyRecruiterMetrics(owner: string): RecruiterMetrics {
  return {
    owner,
    activePipelineSize: 0,
    avgTimePerStage: STAGE_ORDER.map((stage) => ({ key: stage, label: STAGE_LABELS[stage], days: 0 })),
    offerAcceptance: { sent: 0, accepted: 0, ratePercent: null },
    rejectedTotal: 0,
    rejectionByStage: [],
    tatAdherence: { completedSteps: 0, onTrackSteps: 0, adherencePercent: null },
    documentationCompleteness: { rejectionReasonPercent: null, employmentHistoryPercent: null },
    requisitionsClosedInPeriod: 0,
    avgTimeToFillDays: null,
    candidatesSourcedInPeriod: 0,
    candidatesScreenedInPeriod: 0,
    graceExtensionsRequestedInPeriod: 0,
    timeToFirstActionHours: null,
  };
}

const OFFER_OR_LATER_STAGES = new Set<Stage>(["offer_process", "offer_accepted_completed", "handover_to_hrms"]);

export function computeRecruiterMetrics(
  requisitions: Requisition[],
  candidates: Candidate[],
  dateRange: DateRangeKey
): RecruiterMetrics[] {
  const cutoff = cutoffFor(dateRange);
  const now = new Date();

  // Requisition attribution: a requisition doesn't carry its own recruiter
  // field, so "closed" credit goes to whichever recruiter owns the
  // candidate with the EARLIEST offer_accepted_at against that requisition
  // — the same candidate the org-wide Time to Fill calc already keys off.
  // If more than one distinct owner appears among ALL accepted candidates
  // for a requisition (not just the earliest), that's a real ambiguity in
  // the attribution rule, not a bug — logged here for visibility rather
  // than silently picking a side.
  const closedByRequisition = new Map<string, { owner: string; closedAt: string; days: number }>();
  for (const req of requisitions) {
    const accepted = candidates
      .filter((c) => c.requisition_id === req.id && c.offer_accepted_at)
      .sort((a, b) => new Date(a.offer_accepted_at as string).getTime() - new Date(b.offer_accepted_at as string).getTime());
    if (accepted.length === 0) continue;
    const distinctOwners = new Set(accepted.map((c) => c.owner?.trim() || "Unassigned"));
    if (distinctOwners.size > 1) {
      console.warn(
        `[recruiterMetrics] Requisition ${req.req_code} has offer-accepted candidates owned by multiple recruiters (${[...distinctOwners].join(", ")}) — attributing to the earliest acceptance only.`
      );
    }
    const earliest = accepted[0];
    const days = Math.round(((new Date(earliest.offer_accepted_at as string).getTime() - new Date(req.created_at).getTime()) / MS_PER_DAY) * 10) / 10;
    closedByRequisition.set(req.id, {
      owner: earliest.owner?.trim() || "Unassigned",
      closedAt: earliest.offer_accepted_at as string,
      days: Math.max(0, days),
    });
  }

  const owners = [...new Set(candidates.map((c) => c.owner?.trim() || "Unassigned"))].sort();

  return owners.map((owner) => {
    const ownedCandidates = candidates.filter((c) => (c.owner?.trim() || "Unassigned") === owner);
    const activeOwned = ownedCandidates.filter((c) => c.status === "active");
    const rejectedOwned = ownedCandidates.filter((c) => c.status === "rejected");

    const activePipelineSize = activeOwned.length;

    const avgTimePerStage: DaysItem[] = STAGE_ORDER.map((stage) => {
      const inStage = activeOwned.filter((c) => c.current_stage === stage);
      const avgDays =
        inStage.length > 0
          ? inStage.reduce((sum, c) => sum + (now.getTime() - new Date(c.stage_entered_at).getTime()) / MS_PER_DAY, 0) /
            inStage.length
          : 0;
      return { key: stage, label: STAGE_LABELS[stage], days: Math.round(avgDays * 10) / 10 };
    });

    // Offer acceptance rate — identical inference to the org-wide version:
    // "sent" is inferred from ever having reached Offer Process or later,
    // since there's no discrete offer-sent event logged.
    const everInOfferProcess = ownedCandidates.filter(
      (c) =>
        !!c.offer_accepted_at ||
        (c.status === "active" && OFFER_OR_LATER_STAGES.has(c.current_stage)) ||
        (c.status === "rejected" && !!c.rejected_from_stage && OFFER_OR_LATER_STAGES.has(c.rejected_from_stage as Stage))
    );
    const acceptedOwned = ownedCandidates.filter((c) => !!c.offer_accepted_at);
    const offerAcceptance = {
      sent: everInOfferProcess.length,
      accepted: acceptedOwned.length,
      ratePercent: everInOfferProcess.length > 0 ? Math.round((acceptedOwned.length / everInOfferProcess.length) * 100) : null,
    };

    const rejectionCounts = new Map<string, number>();
    for (const c of rejectedOwned) {
      const stageKey = c.rejected_from_stage ?? "unknown";
      rejectionCounts.set(stageKey, (rejectionCounts.get(stageKey) ?? 0) + 1);
    }
    const rejectionByStage: StageRejectionEntry[] = [...rejectionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: STAGE_LABELS[key as Stage] ?? "Unknown",
        count,
        percent: rejectedOwned.length > 0 ? Math.round((count / rejectedOwned.length) * 100) : null,
      }));

    // TAT adherence — computeStepTatStatus on a COMPLETE step deterministically
    // returns only "on_track" or "breached" (never "at_risk"), so this is an
    // exact historical read, not an approximation.
    const completedSteps = ownedCandidates.flatMap((c) => c.offer_steps.filter((s) => s.status === "complete"));
    const onTrackSteps = completedSteps.filter((s) => computeStepTatStatus(s, now) === "on_track");
    const tatAdherence = {
      completedSteps: completedSteps.length,
      onTrackSteps: onTrackSteps.length,
      adherencePercent: completedSteps.length > 0 ? Math.round((onTrackSteps.length / completedSteps.length) * 100) : null,
    };

    // Documentation completeness — starting rubric, flagged to the user as
    // not final. Note: rejection_reason is already required by the reject
    // action's own validation, so that half of the rubric will read ~100%
    // by construction — it's a data-integrity check, not a useful signal.
    const rejectedWithReason = rejectedOwned.filter((c) => !!c.rejection_reason?.trim());
    const rejectionReasonPercent = rejectedOwned.length > 0 ? Math.round((rejectedWithReason.length / rejectedOwned.length) * 100) : null;

    const pastStep1Experienced = ownedCandidates.filter(
      (c) => c.candidate_track === "experienced" && c.offer_steps.find((s) => s.step_number === 1)?.status === "complete"
    );
    const withEmploymentHistory = pastStep1Experienced.filter((c) => c.employment_history.length > 0);
    const employmentHistoryPercent =
      pastStep1Experienced.length > 0 ? Math.round((withEmploymentHistory.length / pastStep1Experienced.length) * 100) : null;

    // --- Period-scoped metrics below ---

    const closedInPeriodEntries = [...closedByRequisition.values()].filter(
      (entry) => entry.owner === owner && inPeriod(entry.closedAt, cutoff)
    );
    const requisitionsClosedInPeriod = closedInPeriodEntries.length;
    const avgTimeToFillDays =
      closedInPeriodEntries.length > 0
        ? Math.round((closedInPeriodEntries.reduce((sum, e) => sum + e.days, 0) / closedInPeriodEntries.length) * 10) / 10
        : null;

    const sourcedInPeriod = ownedCandidates.filter((c) => inPeriod(c.created_at, cutoff));
    const candidatesSourcedInPeriod = sourcedInPeriod.length;

    // "Screened in period" — read off the "Moved stage" audit entry whose
    // details end in "→ Screening" (appendAudit's fixed format), since
    // there's no separate per-stage timestamp retained once a candidate
    // moves on. Candidates seeded directly into/past Screening without ever
    // going through move_stage (e.g. some demo data) won't have this entry
    // and so won't count here — a known gap of using the audit log as the
    // source of truth for historical stage transitions.
    const screenedMarker = `→ ${STAGE_LABELS.screening}`;
    const candidatesScreenedInPeriod = ownedCandidates.filter((c) =>
      c.audit_log.some((e) => e.action === "Moved stage" && e.details?.endsWith(screenedMarker) && inPeriod(e.timestamp, cutoff))
    ).length;

    // Grace extensions "they made" — authored by this recruiter (by name),
    // regardless of whose candidate the step belongs to.
    const graceExtensionsRequestedInPeriod = candidates
      .flatMap((c) => c.offer_steps.flatMap((s) => s.grace_extensions ?? []))
      .filter((g) => g.requested_by === owner && inPeriod(g.requested_at, cutoff)).length;

    // Time to first action — time from a candidate's created_at to the
    // first audit_log entry authored by a human (not "System") AFTER the
    // automatic "Candidate added at Sourcing" entry every candidate gets at
    // creation (audit_log[0]) — excluding that entry is what makes this a
    // measure of responsiveness rather than a constant ~0. Scoped to
    // candidates sourced in the selected period, so the number moves when
    // the date range does.
    const firstActionHours: number[] = [];
    for (const c of sourcedInPeriod) {
      const firstHumanEntry = c.audit_log.slice(1).find((e) => e.actor !== "System");
      if (firstHumanEntry) {
        firstActionHours.push((new Date(firstHumanEntry.timestamp).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60));
      }
    }
    const timeToFirstActionHours =
      firstActionHours.length > 0 ? Math.round((firstActionHours.reduce((sum, h) => sum + h, 0) / firstActionHours.length) * 10) / 10 : null;

    return {
      owner,
      activePipelineSize,
      avgTimePerStage,
      offerAcceptance,
      rejectedTotal: rejectedOwned.length,
      rejectionByStage,
      tatAdherence,
      documentationCompleteness: { rejectionReasonPercent, employmentHistoryPercent },
      requisitionsClosedInPeriod,
      avgTimeToFillDays,
      candidatesSourcedInPeriod,
      candidatesScreenedInPeriod,
      graceExtensionsRequestedInPeriod,
      timeToFirstActionHours,
    };
  });
}
