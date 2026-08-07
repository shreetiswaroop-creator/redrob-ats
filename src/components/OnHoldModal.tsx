"use client";

import { useState } from "react";
import { Modal, Field, inputClass } from "./Modal";

export function OnHoldModal({
  candidateName,
  onClose,
  onConfirm,
}: {
  candidateName: string;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      setError("A note explaining why is required.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(note);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Put ${candidateName} on hold`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Reason *">
          <textarea
            autoFocus
            rows={3}
            className={inputClass}
            placeholder="e.g. long notice period, still negotiating compensation"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Put on hold"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
