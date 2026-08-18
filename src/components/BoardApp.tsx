"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Candidate, CustomFieldDefinition, PendingEmailInfo, Requisition, RequisitionStatus, RequisitionUrgency, Stage } from "@/lib/types";
import { KanbanBoard } from "./KanbanBoard";
import { NewRequisitionModal } from "./NewRequisitionModal";
import { CandidateDetailPanel } from "./CandidateDetailPanel";
import { RejectModal } from "./RejectModal";
import { OnHoldModal } from "./OnHoldModal";
import { ConfirmMoveModal } from "./ConfirmMoveModal";
import { api } from "@/lib/api";

export function BoardApp({
  initialRequisitions,
  initialCandidates,
  pendingEmailByCandidate: initialPendingEmailByCandidate,
  customFieldDefinitions,
}: {
  initialRequisitions: Requisition[];
  initialCandidates: Candidate[];
  pendingEmailByCandidate: Record<string, PendingEmailInfo>;
  customFieldDefinitions: CustomFieldDefinition[];
}) {
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [pendingEmailByCandidate, setPendingEmailByCandidate] = useState(initialPendingEmailByCandidate);
  const [filterReqId, setFilterReqId] = useState<string>("all");
  // Set via the Dashboard's "Pending your approval" tile (?status=raised) so
  // clicking it actually jumps to those requisitions, not just a count —
  // narrows the Requisitions column only, independent of filterReqId.
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<RequisitionStatus | null>(() => {
    const s = searchParams.get("status");
    return s === "raised" ? "raised" : null;
  });
  const [showNewReq, setShowNewReq] = useState(false);
  // Set via the Approvals bell/page (?candidate=<id>) so a candidate-level
  // pending item (reference exception, grace extension, offer document
  // review) opens straight to that candidate's card — same query-param
  // deep-link convention as statusFilter above, just keyed on candidate id.
  const [openCandidate, setOpenCandidate] = useState<Candidate | null>(() => {
    const candidateId = searchParams.get("candidate");
    return candidateId ? initialCandidates.find((c) => c.id === candidateId) ?? null : null;
  });
  const [rejectDropCandidateId, setRejectDropCandidateId] = useState<string | null>(null);
  const [onHoldCandidateId, setOnHoldCandidateId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ candidateId: string; toStage: Stage } | null>(null);
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

  const visibleRequisitions = useMemo(() => {
    let list = filterReqId === "all" ? requisitions : requisitions.filter((r) => r.id === filterReqId);
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    return list;
  }, [requisitions, filterReqId, statusFilter]);
  const visibleCandidates = useMemo(() => {
    // Keep in lockstep with visibleRequisitions — KanbanBoard resolves each
    // candidate's requisition via a map built from the requisitions it's
    // given, so a candidate whose requisition got filtered out there but not
    // here renders with no requisition label.
    if (filterReqId === "all" && !statusFilter) return candidates;
    const visibleIds = new Set(visibleRequisitions.map((r) => r.id));
    return candidates.filter((c) => visibleIds.has(c.requisition_id));
  }, [candidates, filterReqId, statusFilter, visibleRequisitions]);

  function upsertCandidate(updated: Candidate) {
    setCandidates((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    refreshPendingEmail(updated.id);
  }

  async function handleChangeRequisitionStatus(id: string, status: RequisitionStatus, note?: string) {
    try {
      const updated = await api.setRequisitionStatus(id, status, note);
      if (updated.archived) {
        // Fulfilled/Expired archives the requisition (and every one of its
        // candidates, server-side) immediately — clear both off this board
        // right away instead of waiting for the next full page load.
        setRequisitions((rs) => rs.filter((r) => r.id !== id));
        setCandidates((cs) => cs.filter((c) => c.requisition_id !== id));
      } else {
        setRequisitions((rs) => rs.map((r) => (r.id === id ? updated : r)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleChangeClosureTat(id: string, days: number) {
    try {
      const updated = await api.updateRequisitionClosureTat(id, days);
      setRequisitions((rs) => rs.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleChangeRequisitionDetails(
    id: string,
    fields: { urgency?: RequisitionUrgency; description?: string; custom_fields?: Record<string, unknown> }
  ) {
    try {
      const updated = await api.updateRequisitionDetails(id, fields);
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

  async function handleConfirmMove() {
    if (!pendingMove) return;
    const { candidateId, toStage } = pendingMove;
    setPendingMove(null);
    await handleMoveStage(candidateId, toStage);
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
  const pendingMoveCandidate = pendingMove ? candidates.find((c) => c.id === pendingMove.candidateId) : undefined;

  return (
    <div>
      {statusFilter === "raised" && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <span>Showing only Raised requisitions — pending your approval.</span>
          <button className="font-medium underline" onClick={() => setStatusFilter(null)}>
            Clear filter
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          value={filterReqId}
          onChange={(e) => setFilterReqId(e.target.value)}
        >
          <option value="all">All requisitions</option>
          {requisitions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.req_code} — {r.title}{r.client?.name ? ` (${r.client.name})` : ""}
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
        onChangeClosureTat={handleChangeClosureTat}
        onChangeRequisitionDetails={handleChangeRequisitionDetails}
        onOpenCandidate={(c) => setOpenCandidate(c)}
        onMoveStage={handleMoveStage}
        onRequestMoveStage={(id, toStage) => setPendingMove({ candidateId: id, toStage })}
        onDropReject={(id) => setRejectDropCandidateId(id)}
        onRestore={handleRestore}
        onCancelPendingEmail={handleCancelPendingEmail}
        onSetOnHold={(id) => setOnHoldCandidateId(id)}
        onClearOnHold={handleClearOnHold}
        customFieldDefinitions={customFieldDefinitions}
      />

      {showNewReq && (
        <NewRequisitionModal
          onClose={() => setShowNewReq(false)}
          onCreated={(req) => setRequisitions((rs) => [req, ...rs])}
          customFieldDefinitions={customFieldDefinitions.filter((d) => d.entity_type === "requisition")}
        />
      )}

      {openCandidate && (
        <CandidateDetailPanel
          candidate={candidates.find((c) => c.id === openCandidate.id) ?? openCandidate}
          requisition={requisitions.find((r) => r.id === openCandidate.requisition_id)}
          pendingEmail={pendingEmailByCandidate[openCandidate.id] ?? null}
          onClose={() => setOpenCandidate(null)}
          onUpdated={upsertCandidate}
          customFieldDefinitions={customFieldDefinitions.filter((d) => d.entity_type === "candidate")}
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

      {pendingMove && pendingMoveCandidate && (
        <ConfirmMoveModal
          candidate={pendingMoveCandidate}
          requisition={requisitions.find((r) => r.id === pendingMoveCandidate.requisition_id)}
          toStage={pendingMove.toStage}
          onCancel={() => setPendingMove(null)}
          onConfirm={handleConfirmMove}
        />
      )}
    </div>
  );
}
