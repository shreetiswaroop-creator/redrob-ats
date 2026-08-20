"use client";

import { useState } from "react";
import {
  Candidate,
  CustomFieldDefinition,
  CustomFieldValues,
  Requisition,
  RequisitionStatus,
  REQUISITION_STATUS_LABELS,
  REQUISITION_STATUS_ORDER,
  RequisitionUrgency,
  REQUISITION_URGENCY_LABELS,
  REQUISITION_URGENCY_ORDER,
} from "@/lib/types";
import { useActor } from "@/lib/actor-context";
import { computeClosureTatStatus } from "@/lib/tat";
import { CustomFieldsFields } from "./CustomFieldsFields";

// Deliberately client-driven rather than one long-running server route: a
// requisition with 40+ candidates could exceed a serverless function's
// duration comfortably, and this way "Re-scoring 12 of 40…" is real
// progress, not a guess. Concurrency is capped so a big requisition doesn't
// fire dozens of Gemini calls at once.
const RESCORE_CONCURRENCY = 3;

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    const i = index++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

// Mirrors the server-side restrictedStatuses gate in
// /api/requisitions/[id]/route.ts — UI hiding is cosmetic, the API check is
// the real control, but keeping them in sync avoids a recruiter hitting a
// 403 on an option the dropdown implied was available.
const HR_MANAGEMENT_ONLY_STATUSES: RequisitionStatus[] = ["approved", "fulfilled", "on_hold", "expired"];

const STATUS_BADGE: Record<RequisitionStatus, string> = {
  raised: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  fulfilled: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

// Closure TAT is a distinct, requisition-level metric from the per-offer-step
// TAT tracked on candidates — see computeClosureTatStatus in src/lib/tat.ts.
const CLOSURE_TAT_BADGE: Record<"on_track" | "at_risk" | "breached", string> = {
  on_track: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  at_risk: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  breached: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};
const CLOSURE_TAT_LABEL: Record<"on_track" | "at_risk" | "breached", string> = {
  on_track: "Closure TAT: On track",
  at_risk: "Closure TAT: At risk",
  breached: "Closure TAT: Breached",
};

// How urgently the ROLE needs filling — distinct from a candidate's own
// P1/P2/P3 priority badge (CandidateCardFace.tsx).
const URGENCY_BADGE: Record<RequisitionUrgency, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  medium: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export function RequisitionCardFace({
  requisition,
  activeCandidates,
  onChangeStatus,
  onChangeClosureTat,
  onChangeDetails,
  onRescoreCandidate,
  customFieldDefinitions,
}: {
  requisition: Requisition;
  activeCandidates: Candidate[];
  onChangeStatus: (status: RequisitionStatus, note?: string) => void;
  onChangeClosureTat: (days: number) => void;
  onChangeDetails: (fields: { urgency?: RequisitionUrgency; description?: string; custom_fields?: CustomFieldValues }) => void;
  onRescoreCandidate: (id: string) => Promise<Candidate>;
  customFieldDefinitions: CustomFieldDefinition[];
}) {
  const [note, setNote] = useState(requisition.status_note ?? "");
  const [closureTatDays, setClosureTatDays] = useState(requisition.closure_tat_days);
  const [description, setDescription] = useState(requisition.description ?? "");
  const [rescoringAll, setRescoringAll] = useState(false);
  const [rescoreProgress, setRescoreProgress] = useState<{ done: number; total: number } | null>(null);
  const { user } = useActor();
  const isHrManagement = user?.role === "hr_management";
  const closureTatStatus = computeClosureTatStatus(requisition);

  async function handleRescoreAll() {
    if (activeCandidates.length === 0) return;
    setRescoringAll(true);
    setRescoreProgress({ done: 0, total: activeCandidates.length });
    await runWithConcurrency(activeCandidates, RESCORE_CONCURRENCY, async (c) => {
      try {
        await onRescoreCandidate(c.id);
      } catch {
        // Best-effort — one candidate failing (network hiccup, unreadable
        // resume) shouldn't stop the rest of the batch; their own card ends
        // up showing "Scoring failed — retry" for individual follow-up.
      } finally {
        setRescoreProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
      }
    });
    setRescoringAll(false);
    setRescoreProgress(null);
  }

  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{requisition.req_code}</span>
        <div className="flex items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${URGENCY_BADGE[requisition.urgency]}`}>
            {REQUISITION_URGENCY_LABELS[requisition.urgency]}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {requisition.position_type === "experienced" ? "Experienced" : "Intern/Fresher"}
          </span>
        </div>
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{requisition.title}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {[requisition.client?.name, requisition.department, requisition.location].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Headcount: {requisition.headcount}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">HM: {requisition.hiring_manager}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[requisition.status]}`}>
          {REQUISITION_STATUS_LABELS[requisition.status]}
        </span>
        {requisition.approval_skipped && (
          <span
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400"
            title={`Raised and approved by the same HR Management user (${requisition.approved_by ?? "unknown"}) — never went through a separate review.`}
          >
            ⚡ Self-approved
          </span>
        )}
        {closureTatStatus && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CLOSURE_TAT_BADGE[closureTatStatus]}`}
            title={`Target closure: ${requisition.closure_tat_days} days from approval`}
          >
            {CLOSURE_TAT_LABEL[closureTatStatus]}
          </span>
        )}
      </div>

      <select
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        value={requisition.status}
        onChange={(e) => onChangeStatus(e.target.value as RequisitionStatus, note)}
      >
        {REQUISITION_STATUS_ORDER.map((s) => (
          <option key={s} value={s} disabled={!isHrManagement && HR_MANAGEMENT_ONLY_STATUSES.includes(s)}>
            {REQUISITION_STATUS_LABELS[s]}
            {!isHrManagement && HR_MANAGEMENT_ONLY_STATUSES.includes(s) ? " (HR Management)" : ""}
          </option>
        ))}
      </select>
      <input
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        placeholder="Note (optional) — e.g. why on hold"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (requisition.status_note ?? "") && onChangeStatus(requisition.status, note)}
      />
      <label className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        Target closure (days):
        <input
          type="number"
          min={1}
          className="w-16 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          value={closureTatDays}
          onChange={(e) => setClosureTatDays(Number(e.target.value))}
          onBlur={() => closureTatDays !== requisition.closure_tat_days && closureTatDays > 0 && onChangeClosureTat(closureTatDays)}
        />
      </label>
      <label className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        Urgency:
        <select
          className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          value={requisition.urgency}
          onChange={(e) => onChangeDetails({ urgency: e.target.value as RequisitionUrgency })}
        >
          {REQUISITION_URGENCY_ORDER.map((u) => (
            <option key={u} value={u}>
              {REQUISITION_URGENCY_LABELS[u]}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        placeholder="Role description / responsibilities (optional)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== (requisition.description ?? "") && onChangeDetails({ description })}
      />
      <CustomFieldsFields
        definitions={customFieldDefinitions}
        values={requisition.custom_fields ?? {}}
        onChange={(next) => onChangeDetails({ custom_fields: next })}
      />

      {activeCandidates.length > 0 && (
        <button
          type="button"
          onClick={handleRescoreAll}
          disabled={rescoringAll}
          title="Re-scores every active candidate's AI fit score against this requisition's current JD"
          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {rescoreProgress ? `Re-scoring ${rescoreProgress.done} of ${rescoreProgress.total}…` : "Re-score all candidates"}
        </button>
      )}
    </div>
  );
}
