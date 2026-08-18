"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export function InterviewClearedModal({
  candidateName,
  roundName,
  onClose,
  onMoveToSelected,
  onNeedsAnotherRound,
}: {
  candidateName: string;
  roundName: string;
  onClose: () => void;
  onMoveToSelected: () => Promise<void>;
  onNeedsAnotherRound: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleMoveToSelected() {
    setSubmitting(true);
    setError(null);
    try {
      await onMoveToSelected();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  async function handleNeedsAnotherRound() {
    setSubmitting(true);
    setError(null);
    try {
      await onNeedsAnotherRound();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`${candidateName} cleared ${roundName}`} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Is {candidateName} selected for the final decision, or does another interview round need to be scheduled?
      </p>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleMoveToSelected}
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? "Moving…" : "Selected — move to Final Decision"}
        </button>
        <button
          type="button"
          onClick={handleNeedsAnotherRound}
          disabled={submitting}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {submitting ? "Notifying…" : "Needs another round"}
        </button>
      </div>
    </Modal>
  );
}
