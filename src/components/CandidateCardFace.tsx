"use client";

import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Candidate, PendingEmailInfo, Requisition, Stage, STAGE_LABELS, StepTatStatus } from "@/lib/types";
import { computeStepTatStatus } from "@/lib/tat";

const TAT_COLORS: Record<Candidate["tat_status"], string> = {
  on_track: "bg-emerald-500",
  at_risk: "bg-amber-500",
  breached: "bg-red-500",
};

const STEP_TAT_DOT: Record<StepTatStatus, string> = {
  on_track: "bg-emerald-500",
  at_risk: "bg-amber-500",
  breached: "bg-red-500",
};

const STEP_STATUS_CHIP: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500",
  in_progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  na: "bg-slate-50 text-slate-300 line-through dark:bg-slate-800 dark:text-slate-600",
};

const FIT_SCORE_TOOLTIP = "AI-generated estimate to help triage — not a hiring decision.";

function fitScoreBadgeClass(score: number): string {
  if (score >= 75) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
  if (score >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
}

function FitScoreBadge({ candidate }: { candidate: Candidate }) {
  if (candidate.fit_scoring_status === "not_scored") return null;
  if (candidate.fit_scoring_status === "pending") {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
        Scoring…
      </span>
    );
  }
  if (candidate.fit_scoring_status === "failed") {
    return (
      <span
        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400"
        title={candidate.fit_rationale ?? "AI fit scoring failed"}
      >
        Scoring failed
      </span>
    );
  }
  if (candidate.fit_score === null) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${fitScoreBadgeClass(candidate.fit_score)}`}
      title={FIT_SCORE_TOOLTIP}
    >
      {candidate.fit_score}% match
    </span>
  );
}

const PRIORITY_BADGE: Record<string, string> = {
  P1: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  P2: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  P3: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

function minutesRemaining(scheduledSendAt: string): number {
  return Math.max(0, Math.round((new Date(scheduledSendAt).getTime() - Date.now()) / 60000));
}

function PendingEmailBanner({ pendingEmail, onCancel }: { pendingEmail: PendingEmailInfo; onCancel: () => void }) {
  const [minutes, setMinutes] = useState(() => minutesRemaining(pendingEmail.scheduled_send_at));

  useEffect(() => {
    setMinutes(minutesRemaining(pendingEmail.scheduled_send_at));
    const interval = setInterval(() => setMinutes(minutesRemaining(pendingEmail.scheduled_send_at)), 30000);
    return () => clearInterval(interval);
  }, [pendingEmail.scheduled_send_at]);

  return (
    <div
      className="mt-2 flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      onClick={(e) => e.stopPropagation()}
      title={pendingEmail.subject}
    >
      <span>Email pending — sends in {minutes}m</span>
      <button onClick={onCancel} className="whitespace-nowrap font-medium underline">
        Cancel
      </button>
    </div>
  );
}

export function CandidateCardFace({
  candidate,
  requisition,
  pendingEmail,
  onOpen,
  nextStage,
  onMoveNext,
  onReject,
  onCancelPendingEmail,
  onRestore,
  onSetOnHold,
  onClearOnHold,
}: {
  candidate: Candidate;
  requisition: Requisition | undefined;
  pendingEmail?: PendingEmailInfo | null;
  onOpen: () => void;
  nextStage?: Stage | null;
  onMoveNext?: () => void;
  onReject?: () => void;
  onCancelPendingEmail?: (notificationId: string) => void;
  onRestore?: () => void;
  onSetOnHold?: () => void;
  onClearOnHold?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `cand:${candidate.id}`,
    disabled: candidate.status === "rejected",
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onOpen}
      className="mb-2 cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
    >
      <div {...listeners} {...attributes} className={candidate.status === "rejected" ? "" : "cursor-grab"}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{candidate.candidate_code}</span>
          <span className={`h-2 w-2 rounded-full ${TAT_COLORS[candidate.tat_status]}`} title={candidate.tat_status} />
        </div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{candidate.name}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {requisition ? `${requisition.title} · ${requisition.req_code}` : "—"}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {candidate.candidate_track === "experienced" ? "Experienced" : "Intern/Fresher"}
          </span>
          <FitScoreBadge candidate={candidate} />
          {candidate.priority && (
            <span className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_BADGE[candidate.priority]}`}>{candidate.priority}</span>
          )}
          {candidate.status === "rejected" && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-900 dark:text-red-300">Rejected</span>
          )}
          {candidate.consent_given ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              ✓ Consent given
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              ⚠ No consent on file
            </span>
          )}
        </div>
        {candidate.manual_followup_note && (
          <div className="mt-2 rounded-md bg-orange-50 px-2 py-1 text-[10px] text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            ⚠ Needs manual follow-up: {candidate.manual_followup_note}
          </div>
        )}
        {candidate.on_hold && (
          <div className="mt-2 rounded-md bg-sky-50 px-2 py-1 text-[10px] text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            ⏸ On hold: {candidate.on_hold_note}
          </div>
        )}
        {candidate.interview_rounds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {candidate.interview_rounds.map((r, i) => (
              <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                {r.round_name}: {r.outcome}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Owner: {candidate.owner}</div>

        {candidate.current_stage === "offer_process" && (
          <div className="mt-2 flex flex-wrap gap-1">
            {candidate.offer_steps.map((s) => {
              const tat = computeStepTatStatus(s);
              return (
                <span
                  key={s.step_number}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${STEP_STATUS_CHIP[s.status]}`}
                  title={`Step ${s.step_number}: ${s.step_name} — ${s.status}`}
                >
                  {tat && <span className={`h-1.5 w-1.5 rounded-full ${STEP_TAT_DOT[tat]}`} />}
                  {s.step_number}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {pendingEmail && onCancelPendingEmail && (
        <PendingEmailBanner pendingEmail={pendingEmail} onCancel={() => onCancelPendingEmail(pendingEmail.id)} />
      )}

      {candidate.status === "active" && (onMoveNext || onReject) && (
        <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
          {nextStage && onMoveNext && (
            <button
              onClick={onMoveNext}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              title={`Move to ${STAGE_LABELS[nextStage]}`}
            >
              Next: {STAGE_LABELS[nextStage]}
            </button>
          )}
          {onReject && (
            <button
              onClick={onReject}
              className="rounded-md border border-red-200 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              Reject
            </button>
          )}
        </div>
      )}

      {candidate.status === "active" && !candidate.on_hold && onSetOnHold && (
        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onSetOnHold}
            className="w-full rounded-md border border-sky-200 px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950"
          >
            Put on hold
          </button>
        </div>
      )}
      {candidate.status === "active" && candidate.on_hold && onClearOnHold && (
        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onClearOnHold}
            className="w-full rounded-md border border-sky-200 px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950"
          >
            Clear hold
          </button>
        </div>
      )}

      {candidate.status === "rejected" && onRestore && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onRestore}
            className="w-full rounded-md border border-emerald-300 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            Restore
          </button>
        </div>
      )}
    </div>
  );
}
