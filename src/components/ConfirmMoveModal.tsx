"use client";

import { Modal } from "./Modal";
import { Candidate, Requisition, Stage, STAGE_LABELS } from "@/lib/types";

export function ConfirmMoveModal({
  candidate,
  requisition,
  toStage,
  onCancel,
  onConfirm,
}: {
  candidate: Candidate;
  requisition: Requisition | undefined;
  toStage: Stage;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Confirm candidate move" onClose={onCancel}>
      <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">
        Please reconfirm before moving this candidate to the next step:
      </p>
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="font-semibold text-slate-900 dark:text-slate-100">{candidate.name}</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {requisition ? `${requisition.title} · ${requisition.req_code}` : "—"}
        </div>
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Moving to <span className="font-medium text-slate-900 dark:text-slate-100">{STAGE_LABELS[toStage]}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Yes, I confirm
        </button>
      </div>
    </Modal>
  );
}
