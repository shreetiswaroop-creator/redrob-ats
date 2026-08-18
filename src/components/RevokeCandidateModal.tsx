"use client";

import { useEffect, useState } from "react";
import { Candidate, Requisition } from "@/lib/types";
import { api } from "@/lib/api";
import { Modal, Field, inputClass } from "./Modal";

export function RevokeCandidateModal({
  candidate,
  onClose,
  onRevoked,
}: {
  candidate: Candidate;
  onClose: () => void;
  onRevoked: (c: Candidate, requisition: Requisition) => void;
}) {
  const [openRequisitions, setOpenRequisitions] = useState<Requisition[] | null>(null);
  const [requisitionId, setRequisitionId] = useState(candidate.requisition_id);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listRequisitions({ archived: false })
      .then((rows) => {
        if (cancelled) return;
        // Same "open" filter used elsewhere (e.g. InterviewsView) — Expired
        // positions aren't worth scheduling/reconsidering candidates for;
        // Fulfilled/On Hold ones can still have in-flight work.
        const open = rows.filter((r) => r.status !== "expired");
        setOpenRequisitions(open);
        if (!open.some((r) => r.id === candidate.requisition_id) && open.length > 0) {
          setRequisitionId(open[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load open requisitions."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    if (!requisitionId) return;
    const requisition = openRequisitions?.find((r) => r.id === requisitionId);
    if (!requisition) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.revokeCandidate(candidate.id, requisitionId);
      onRevoked(updated, requisition);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Reconsider ${candidate.name}`} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Which open position is {candidate.name} now being considered for? They&apos;ll re-enter the pipeline in
        Sourcing so their details can be reviewed fresh.
      </p>

      {loading && <p className="text-xs text-slate-400 dark:text-slate-500">Loading open positions…</p>}

      {!loading && openRequisitions && openRequisitions.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">No open requisitions to reconsider this candidate for.</p>
      )}

      {!loading && openRequisitions && openRequisitions.length > 0 && (
        <Field label="Position">
          <select className={inputClass} value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)}>
            {openRequisitions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} ({r.req_code})
              </option>
            ))}
          </select>
        </Field>
      )}

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || loading || !requisitionId}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          {submitting ? "Revoking…" : "Revoke and review"}
        </button>
      </div>
    </Modal>
  );
}
