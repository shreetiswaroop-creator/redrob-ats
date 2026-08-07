"use client";

import { useMemo, useState } from "react";
import { Candidate, PendingEmailInfo, Requisition, RequisitionStatus, Stage } from "@/lib/types";
import { KanbanBoard } from "./KanbanBoard";
import { NewRequisitionModal } from "./NewRequisitionModal";
import { NewCandidateModal } from "./NewCandidateModal";
import { CandidateDetailPanel } from "./CandidateDetailPanel";
import { RejectModal } from "./RejectModal";
import { OnHoldModal } from "./OnHoldModal";
import { OrgSettingsModal } from "./OrgSettingsModal";
import { api } from "@/lib/api";

export function BoardApp({
  initialRequisitions,
  initialCandidates,
  pendingEmailByCandidate: initialPendingEmailByCandidate,
}: {
  initialRequisitions: Requisition[];
  initialCandidates: Candidate[];
  pendingEmailByCandidate: Record<string, PendingEmailInfo>;
}) {
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [pendingEmailByCandidate, setPendingEmailByCandidate] = useState(initialPendingEmailByCandidate);
  const [filterReqId, setFilterReqId] = useState<string>("all");
  const [showNewReq, setShowNewReq] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [addCandidateTo, setAddCandidateTo] = useState<Requisition | null>(null);
  const [openCandidate, setOpenCandidate] = useState<Candidate | null>(null);
  const [rejectDropCandidateId, setRejectDropCandidateId] = useState<string | null>(null);
  const [onHoldCandidateId, setOnHoldCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The candidates PATCH response doesn't report notification side-effects
  // (a stage move or restore can create, cancel, or leave untouched a pending
  // email), so re-check this one candidate's pending state after anything
  // that might have changed it, instead of guessing client-side.
  async function refreshPendingEmail(candidateId: string) {
    try {
      const { pendingEmail } = await api.getPendingEmail(candidateId);
      setPendingEmailByCandidate((prev) => {
        const next = { ...prev };
        if (pendingEmail) next[candidateId] = pendingEmail;
        else delete next[candidateId];
        return next;
      });
    } catch {
      // Best-effort — stale pending-email UI isn't worth surfacing an error for.
    }
  }

  function clearPendingEmail(candidateId: string) {
    setPendingEmailByCandidate((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });
  }

  const visibleRequisitions = useMemo(
    () => (filterReqId === "all" ? requisitions : requisitions.filter((r) => r.id === filterReqId)),
    [requisitions, filterReqId]
  );
  const visibleCandidates = useMemo(
    () => (filterReqId === "all" ? candidates : candidates.filter((c) => c.requisition_id === filterReqId)),
    [candidates, filterReqId]
  );

  function upsertCandidate(updated: Candidate) {
    setCandidates((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    refreshPendingEmail(updated.id);
  }

  async function handleChangeRequisitionStatus(id: string, status: RequisitionStatus, note?: string) {
    try {
      const updated = await api.setRequisitionStatus(id, status, note);
      setRequisitions((rs) => rs.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleMoveStage(id: string, toStage: Stage) {
    try {
      const updated = await api.moveCandidateStage(id, toStage);
      upsertCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleConfirmRejectDrop(reason: string) {
    if (!rejectDropCandidateId) return;
    const updated = await api.rejectCandidate(rejectDropCandidateId, reason);
    upsertCandidate(updated);
  }

  async function handleRestore(id: string) {
    try {
      const updated = await api.restoreCandidate(id);
      upsertCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleCancelPendingEmail(candidateId: string, notificationId: string) {
    try {
      await api.cancelPendingEmail(notificationId);
      clearPendingEmail(candidateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleConfirmOnHold(note: string) {
    if (!onHoldCandidateId) return;
    const updated = await api.setCandidateOnHold(onHoldCandidateId, note);
    upsertCandidate(updated);
  }

  async function handleClearOnHold(id: string) {
    try {
      const updated = await api.clearCandidateOnHold(id);
      upsertCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const rejectDropCandidate = candidates.find((c) => c.id === rejectDropCandidateId);
  const onHoldCandidate = candidates.find((c) => c.id === onHoldCandidateId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          value={filterReqId}
          onChange={(e) => setFilterReqId(e.target.value)}
        >
          <option value="all">All requisitions</option>
          {requisitions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.req_code} — {r.title}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewReq(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            + New requisition
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Notification contacts
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900 dark:text-red-300">
          {error}{" "}
          <button className="underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <KanbanBoard
        requisitions={visibleRequisitions}
        candidates={visibleCandidates}
        pendingEmailByCandidate={pendingEmailByCandidate}
        onChangeRequisitionStatus={handleChangeRequisitionStatus}
        onAddCandidate={(req) => setAddCandidateTo(req)}
        onOpenCandidate={(c) => setOpenCandidate(c)}
        onMoveStage={handleMoveStage}
        onDropReject={(id) => setRejectDropCandidateId(id)}
        onRestore={handleRestore}
        onCancelPendingEmail={handleCancelPendingEmail}
        onSetOnHold={(id) => setOnHoldCandidateId(id)}
        onClearOnHold={handleClearOnHold}
      />

      {showNewReq && (
        <NewRequisitionModal
          onClose={() => setShowNewReq(false)}
          onCreated={(req) => setRequisitions((rs) => [req, ...rs])}
        />
      )}

      {addCandidateTo && (
        <NewCandidateModal
          requisition={addCandidateTo}
          onClose={() => setAddCandidateTo(null)}
          onCreated={(c) => setCandidates((cs) => [c, ...cs])}
        />
      )}

      {openCandidate && (
        <CandidateDetailPanel
          candidate={candidates.find((c) => c.id === openCandidate.id) ?? openCandidate}
          requisition={requisitions.find((r) => r.id === openCandidate.requisition_id)}
          pendingEmail={pendingEmailByCandidate[openCandidate.id] ?? null}
          onClose={() => setOpenCandidate(null)}
          onUpdated={upsertCandidate}
        />
      )}

      {rejectDropCandidate && (
        <RejectModal
          candidateName={rejectDropCandidate.name}
          onClose={() => setRejectDropCandidateId(null)}
          onConfirm={handleConfirmRejectDrop}
        />
      )}

      {onHoldCandidate && (
        <OnHoldModal
          candidateName={onHoldCandidate.name}
          onClose={() => setOnHoldCandidateId(null)}
          onConfirm={handleConfirmOnHold}
        />
      )}

      {showSettings && <OrgSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
