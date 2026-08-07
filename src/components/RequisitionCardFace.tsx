"use client";

import { useState } from "react";
import { Requisition, RequisitionStatus, REQUISITION_STATUS_LABELS, REQUISITION_STATUS_ORDER } from "@/lib/types";

const STATUS_BADGE: Record<RequisitionStatus, string> = {
  raised: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  fulfilled: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function RequisitionCardFace({
  requisition,
  onChangeStatus,
  onAddCandidate,
}: {
  requisition: Requisition;
  onChangeStatus: (status: RequisitionStatus, note?: string) => void;
  onAddCandidate: () => void;
}) {
  const [note, setNote] = useState(requisition.status_note ?? "");

  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{requisition.req_code}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {requisition.position_type === "experienced" ? "Experienced" : "Intern/Fresher"}
        </span>
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{requisition.title}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {[requisition.department, requisition.location].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Headcount: {requisition.headcount}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">HM: {requisition.hiring_manager}</div>

      <div className="mt-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[requisition.status]}`}>
          {REQUISITION_STATUS_LABELS[requisition.status]}
        </span>
      </div>

      <select
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        value={requisition.status}
        onChange={(e) => onChangeStatus(e.target.value as RequisitionStatus, note)}
      >
        {REQUISITION_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {REQUISITION_STATUS_LABELS[s]}
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

      {requisition.status === "approved" && (
        <button
          onClick={onAddCandidate}
          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          + Add candidate
        </button>
      )}
    </div>
  );
}
