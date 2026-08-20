"use client";

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Candidate, CustomFieldDefinition, CustomFieldValues, PendingEmailInfo, Requisition, RequisitionStatus, RequisitionUrgency, Stage, STAGE_ORDER } from "@/lib/types";
import { COLUMNS, REJECTED_COLUMN_KEY } from "@/lib/columns";
import { Column } from "./Column";
import { RequisitionCardFace } from "./RequisitionCardFace";
import { CandidateCardFace } from "./CandidateCardFace";

export function KanbanBoard({
  requisitions,
  candidates,
  pendingEmailByCandidate,
  onChangeRequisitionStatus,
  onChangeClosureTat,
  onChangeRequisitionDetails,
  onOpenCandidate,
  onMoveStage,
  onRequestMoveStage,
  onDropReject,
  onRestore,
  onCancelPendingEmail,
  onSetOnHold,
  onClearOnHold,
  onRescoreCandidate,
  customFieldDefinitions,
}: {
  requisitions: Requisition[];
  candidates: Candidate[];
  pendingEmailByCandidate: Record<string, PendingEmailInfo>;
  onChangeRequisitionStatus: (id: string, status: RequisitionStatus, note?: string) => void;
  onChangeClosureTat: (id: string, days: number) => void;
  onChangeRequisitionDetails: (
    id: string,
    fields: { urgency?: RequisitionUrgency; description?: string; custom_fields?: CustomFieldValues }
  ) => void;
  onOpenCandidate: (candidate: Candidate) => void;
  onMoveStage: (id: string, toStage: Stage) => void;
  onRequestMoveStage: (id: string, toStage: Stage) => void;
  onDropReject: (id: string) => void;
  onRestore: (id: string) => void;
  onCancelPendingEmail: (candidateId: string, notificationId: string) => void;
  onSetOnHold: (id: string) => void;
  onClearOnHold: (id: string) => void;
  onRescoreCandidate: (id: string) => Promise<Candidate>;
  customFieldDefinitions: CustomFieldDefinition[];
}) {
  // Without a distance threshold, dnd-kit treats every pointerdown as a drag
  // start (even with zero movement) and swallows the resulting click — which
  // is why clicking a card to open it was doing nothing. Requiring 8px of
  // movement before a drag "activates" fixes both that and the fiddly-feeling
  // drag (any sub-pixel wobble no longer grabs the card).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const requisitionById = new Map(requisitions.map((r) => [r.id, r]));
  const activeCandidates = candidates.filter((c) => c.status === "active");
  const rejectedCandidates = candidates.filter((c) => c.status === "rejected");

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const [type, id] = String(active.id).split(":");
    if (type !== "cand") return; // requisition status is set via dropdown, not drag-and-drop

    const columnKey = String(over.id);
    if (columnKey === REJECTED_COLUMN_KEY) {
      onDropReject(id);
      return;
    }
    const col = COLUMNS.find((c) => c.key === columnKey);
    if (col?.kind === "candidate") {
      const toStage = col.key as Stage;
      const candidate = candidates.find((c) => c.id === id);
      const isForward = candidate ? STAGE_ORDER.indexOf(toStage) > STAGE_ORDER.indexOf(candidate.current_stage) : false;
      if (isForward && candidate && isUnconfirmedForwardMove(candidate.current_stage, toStage)) {
        onMoveStage(id, toStage);
      } else if (isForward) {
        onRequestMoveStage(id, toStage);
      } else if (candidate && toStage !== candidate.current_stage) {
        onMoveStage(id, toStage);
      }
    }
  }

  function nextStageFor(candidate: Candidate): Stage | null {
    const idx = STAGE_ORDER.indexOf(candidate.current_stage);
    return idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  }

  // Sourcing -> Screening is high-volume triage (20-25 cards at once), not a
  // meaningful decision point — skip the "are you sure" popup only for this
  // one transition. Every other forward move keeps it.
  function isUnconfirmedForwardMove(fromStage: Stage, toStage: Stage): boolean {
    return fromStage === "sourcing" && toStage === "screening";
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex h-[calc(100vh-110px)] gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          if (col.kind === "requisition") {
            return (
              <Column key={col.key} id={col.key} title={col.label} count={requisitions.length}>
                {requisitions.map((r) => (
                  <RequisitionCardFace
                    key={r.id}
                    requisition={r}
                    activeCandidates={activeCandidates.filter((c) => c.requisition_id === r.id)}
                    onChangeStatus={(status, note) => onChangeRequisitionStatus(r.id, status, note)}
                    onChangeClosureTat={(days) => onChangeClosureTat(r.id, days)}
                    onChangeDetails={(fields) => onChangeRequisitionDetails(r.id, fields)}
                    onRescoreCandidate={onRescoreCandidate}
                    customFieldDefinitions={customFieldDefinitions.filter((d) => d.entity_type === "requisition")}
                  />
                ))}
              </Column>
            );
          }
          const items = activeCandidates.filter((c) => c.current_stage === col.key);
          return (
            <Column key={col.key} id={col.key} title={col.label} count={items.length}>
              {items.map((c) => (
                <CandidateCardFace
                  key={c.id}
                  candidate={c}
                  requisition={requisitionById.get(c.requisition_id)}
                  pendingEmail={pendingEmailByCandidate[c.id] ?? null}
                  onOpen={() => onOpenCandidate(c)}
                  nextStage={nextStageFor(c)}
                  onMoveNext={() => {
                    const next = nextStageFor(c);
                    if (!next) return;
                    if (isUnconfirmedForwardMove(c.current_stage, next)) {
                      onMoveStage(c.id, next);
                    } else {
                      onRequestMoveStage(c.id, next);
                    }
                  }}
                  onReject={() => onDropReject(c.id)}
                  onCancelPendingEmail={(notificationId) => onCancelPendingEmail(c.id, notificationId)}
                  onSetOnHold={() => onSetOnHold(c.id)}
                  onClearOnHold={() => onClearOnHold(c.id)}
                />
              ))}
            </Column>
          );
        })}

        <Column id={REJECTED_COLUMN_KEY} title="Rejected" count={rejectedCandidates.length} danger>
          {rejectedCandidates.map((c) => (
            <CandidateCardFace
              key={c.id}
              candidate={c}
              requisition={requisitionById.get(c.requisition_id)}
              pendingEmail={pendingEmailByCandidate[c.id] ?? null}
              onOpen={() => onOpenCandidate(c)}
              onRestore={() => onRestore(c.id)}
              onCancelPendingEmail={(notificationId) => onCancelPendingEmail(c.id, notificationId)}
            />
          ))}
        </Column>
      </div>
    </DndContext>
  );
}
