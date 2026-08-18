"use client";

import { useEffect, useState } from "react";
import {
  Candidate,
  CustomFieldDefinition,
  Requisition,
  REQUISITION_ARCHIVED_REASON_LABELS,
  RequisitionArchivedReason,
  STAGE_LABELS,
} from "@/lib/types";
import { api } from "@/lib/api";
import { RevokeCandidateModal } from "./RevokeCandidateModal";
import { CandidateDetailPanel } from "./CandidateDetailPanel";

const REASON_BADGE: Record<RequisitionArchivedReason, string> = {
  fulfilled: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  on_hold_timeout: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

const PRIORITY_BADGE: Record<string, string> = {
  P1: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  P2: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  P3: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
}

function candidateReasonNote(c: Candidate): string | null {
  if (c.status === "rejected") return c.rejection_reason ? `Rejected — ${c.rejection_reason}` : "Rejected";
  if (c.on_hold) return c.on_hold_note ? `On hold — ${c.on_hold_note}` : "On hold";
  return null;
}

export function ArchiveView({
  initialRequisitions,
  customFieldDefinitions,
}: {
  initialRequisitions: Requisition[];
  customFieldDefinitions: CustomFieldDefinition[];
}) {
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequisitions[0]?.id ?? null);
  const [candidatesByReq, setCandidatesByReq] = useState<Record<string, Candidate[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingReq, setRevokingReq] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Candidate | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ candidate: Candidate; requisition: Requisition } | null>(null);

  const selected = requisitions.find((r) => r.id === selectedId) ?? null;
  const candidates = selectedId ? candidatesByReq[selectedId] : undefined;

  async function loadCandidates(id: string) {
    setError(null);
    if (candidatesByReq[id]) return;
    setLoading(true);
    try {
      const rows = await api.listCandidatesForRequisition(id);
      setCandidatesByReq((prev) => ({ ...prev, [id]: rows }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  }

  function selectRequisition(id: string) {
    setSelectedId(id);
    loadCandidates(id);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedId) loadCandidates(selectedId);
  }, []);

  async function handleRevokeRequisition() {
    if (!selected) return;
    setRevokingReq(true);
    setError(null);
    try {
      await api.revokeRequisition(selected.id);
      setRequisitions((rs) => rs.filter((r) => r.id !== selected.id));
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke.");
    } finally {
      setRevokingReq(false);
    }
  }

  function handleRevoked(updated: Candidate, requisition: Requisition) {
    if (selectedId) {
      setCandidatesByReq((prev) => ({
        ...prev,
        [selectedId]: (prev[selectedId] ?? []).map((c) => (c.id === updated.id ? updated : c)),
      }));
    }
    setRevokeTarget(null);
    setReviewTarget({ candidate: updated, requisition });
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Archive</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Fulfilled, Expired, and long-On-Hold requisitions, with every candidate who was ever on them — cleared
          off the live Kanban but kept here for the record.
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900 dark:text-red-300">
          {error}{" "}
          <button className="underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {requisitions.length === 0 && (
            <p className="p-3 text-xs text-slate-400 dark:text-slate-500">No archived requisitions yet.</p>
          )}
          {requisitions.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => selectRequisition(r.id)}
              className={`mb-1 block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                r.id === selectedId
                  ? "bg-indigo-600 text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{r.title}</span>
                {r.archived_reason && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      r.id === selectedId ? "bg-white/20 text-white" : REASON_BADGE[r.archived_reason]
                    }`}
                  >
                    {REQUISITION_ARCHIVED_REASON_LABELS[r.archived_reason]}
                  </span>
                )}
              </div>
              <div className={`mt-0.5 text-xs ${r.id === selectedId ? "text-indigo-100" : "text-slate-400 dark:text-slate-500"}`}>
                {r.req_code} · archived {formatDate(r.archived_at)}
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {!selected && <p className="text-sm text-slate-500 dark:text-slate-400">Select a requisition to see its candidates.</p>}

          {selected && (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-700">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selected.title} <span className="font-mono text-xs font-normal text-slate-400">{selected.req_code}</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {[selected.department, selected.location].filter(Boolean).join(" · ") || "—"} · HM: {selected.hiring_manager}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selected.archived_reason && REQUISITION_ARCHIVED_REASON_LABELS[selected.archived_reason]} on{" "}
                    {formatDate(selected.archived_at)}
                    {selected.status_note ? ` — ${selected.status_note}` : ""}
                  </p>
                </div>
                {selected.archived_reason === "on_hold_timeout" && (
                  <button
                    onClick={handleRevokeRequisition}
                    disabled={revokingReq}
                    className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    {revokingReq ? "Revoking…" : "Revoke — reopen this position"}
                  </button>
                )}
              </div>

              {loading && <p className="text-xs text-slate-400 dark:text-slate-500">Loading candidates…</p>}

              {!loading && candidates && candidates.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">No candidates were ever added to this requisition.</p>
              )}

              {!loading && candidates && candidates.length > 0 && (
                <div className="space-y-2">
                  {candidates.map((c) => {
                    const reasonNote = candidateReasonNote(c);
                    const revocable = c.archived && c.status !== "rejected";
                    return (
                      <div
                        key={c.id}
                        className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{c.candidate_code}</span>
                            {c.priority && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[c.priority]}`}>
                                {c.priority}
                              </span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {STAGE_LABELS[c.current_stage]}
                            </span>
                            {c.status === "rejected" && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                                Rejected
                              </span>
                            )}
                            {c.consent_given ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                ✓ Consent given
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                ⚠ No consent on file
                              </span>
                            )}
                          </div>
                          {revocable && (
                            <button
                              onClick={() => setRevokeTarget(c)}
                              className="shrink-0 rounded-md border border-emerald-300 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            >
                              Revoke — reconsider candidate
                            </button>
                          )}
                          {c.archived === false && c.archived_reason === null && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                              Revoked — back in active pipeline
                            </span>
                          )}
                        </div>
                        {reasonNote && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{reasonNote}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {revokeTarget && (
        <RevokeCandidateModal
          candidate={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onRevoked={handleRevoked}
        />
      )}

      {reviewTarget && (
        <CandidateDetailPanel
          candidate={reviewTarget.candidate}
          requisition={reviewTarget.requisition}
          customFieldDefinitions={customFieldDefinitions}
          onClose={() => setReviewTarget(null)}
          onUpdated={(updated) => {
            setReviewTarget((prev) => (prev ? { ...prev, candidate: updated } : prev));
            if (selectedId) {
              setCandidatesByReq((prev) => ({
                ...prev,
                [selectedId]: (prev[selectedId] ?? []).map((c) => (c.id === updated.id ? updated : c)),
              }));
            }
          }}
        />
      )}
    </div>
  );
}
