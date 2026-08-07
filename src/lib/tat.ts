import { DEFAULT_STEP_TAT_HOURS, GraceExtension, OfferStep, StepTatStatus } from "./types";

export function effectiveTatHours(step: OfferStep): number {
  const approved = (step.grace_extensions ?? [])
    .filter((g) => g.status === "approved")
    .sort((a, b) => (a.decided_at ?? "").localeCompare(b.decided_at ?? ""));
  const latest = approved[approved.length - 1];
  return latest?.requested_tat_hours ?? step.tat_hours ?? DEFAULT_STEP_TAT_HOURS;
}

export function pendingGraceExtension(step: OfferStep): GraceExtension | null {
  return (step.grace_extensions ?? []).find((g) => g.status === "pending") ?? null;
}

// Section 7.2/7.3: TAT clock starts when a step is initiated and stops when
// it's completed. 80%+ elapsed = at risk, 100%+ = breached. Computed on the
// fly (no background job in this app) rather than stored, so it's always
// accurate whenever someone is actually looking at it.
export function computeStepTatStatus(step: OfferStep, now: Date = new Date()): StepTatStatus | null {
  if (step.status === "not_started" || step.status === "na") return null;
  if (!step.started_at) return null;

  const startMs = new Date(step.started_at).getTime();
  const endMs =
    step.status === "complete" && step.completed_at ? new Date(step.completed_at).getTime() : now.getTime();
  const elapsedHours = (endMs - startMs) / (1000 * 60 * 60);
  const totalHours = effectiveTatHours(step);
  const ratio = totalHours > 0 ? elapsedHours / totalHours : 0;

  if (step.status === "complete") {
    return ratio >= 1 ? "breached" : "on_track";
  }
  if (ratio >= 1) return "breached";
  if (ratio >= 0.8) return "at_risk";
  return "on_track";
}

// Server-side authority for started_at/tat defaults — never trust the client
// to set timestamps. Preserves grace_extensions/tat_hours from the existing
// row when the client's payload is missing them (defensive against older
// client state).
export function normalizeOfferSteps(oldSteps: OfferStep[], newSteps: OfferStep[]): OfferStep[] {
  return newSteps.map((newStep) => {
    const oldStep = oldSteps.find((s) => s.step_number === newStep.step_number);
    let started_at = newStep.started_at ?? oldStep?.started_at ?? null;
    if (newStep.status === "in_progress" && !started_at) {
      started_at = new Date().toISOString();
    }
    return {
      ...newStep,
      started_at,
      tat_hours: newStep.tat_hours ?? oldStep?.tat_hours ?? DEFAULT_STEP_TAT_HOURS,
      grace_extensions: newStep.grace_extensions ?? oldStep?.grace_extensions ?? [],
      last_notified_tat_status: newStep.last_notified_tat_status ?? oldStep?.last_notified_tat_status ?? null,
    };
  });
}
