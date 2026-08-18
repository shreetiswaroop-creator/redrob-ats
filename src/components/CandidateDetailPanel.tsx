"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputClass } from "./Modal";
import { RejectModal } from "./RejectModal";
import { OnHoldModal } from "./OnHoldModal";
import { InterviewClearedModal } from "./InterviewClearedModal";
import {
  Candidate,
  PendingEmailInfo,
  Requisition,
  Stage,
  STAGE_LABELS,
  STAGE_ORDER,
  CANDIDATE_PRIORITIES,
  CANDIDATE_SOURCE_LABELS,
  CANDIDATE_SOURCE_ORDER,
  EmploymentHistoryEntry,
  ReferenceRecord,
  InterviewRound,
  OfferStep,
  OfferDocumentApproval,
  HRMS_HANDOVER_STATUS_LABELS,
  AuditLogEntry,
  CandidateNote,
  CustomFieldDefinition,
} from "@/lib/types";
import { api } from "@/lib/api";
import { computeStepTatStatus, effectiveTatHours, pendingGraceExtension } from "@/lib/tat";
import { CustomFieldsFields } from "./CustomFieldsFields";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in local time — toISOString()
// would silently shift the displayed time by the browser's UTC offset.
function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Mirrors InterviewsView's formatScheduledRange — same fixed locale so the
// candidate's card shows the same start–end window as the Interviews list,
// not just the raw start time the datetime-local input above holds.
function formatRoundWindow(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const startStr = start.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const endStr = end.toLocaleTimeString("en-US", { timeStyle: "short" });
  return `${startStr} – ${endStr}`;
}

function SectionCard({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = !collapsible || open;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${isOpen ? "rotate-180" : ""}`}
          >
            <path d="M3 5.5l4 4 4-4" />
          </svg>
        </button>
      ) : (
        <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      )}
      {isOpen && <div className={collapsible ? "mt-3" : ""}>{children}</div>}
    </div>
  );
}

function SaveButton({ onClick, saved }: { onClick: () => void; saved: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
    >
      {saved ? "Saved ✓" : "Save changes"}
    </button>
  );
}

export function CandidateDetailPanel({
  candidate: initialCandidate,
  requisition,
  pendingEmail,
  onClose,
  onUpdated,
  customFieldDefinitions,
}: {
  candidate: Candidate;
  requisition: Requisition | undefined;
  pendingEmail?: PendingEmailInfo | null;
  customFieldDefinitions: CustomFieldDefinition[];
  onClose: () => void;
  onUpdated: (c: Candidate) => void;
}) {
  const [candidate, setCandidate] = useState(initialCandidate);
  const [showReject, setShowReject] = useState(false);
  const [showOnHold, setShowOnHold] = useState(false);
  const [correctionStage, setCorrectionStage] = useState<Stage>(candidate.current_stage);
  const [clearedRound, setClearedRound] = useState<InterviewRound | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveFields(fields: Record<string, unknown>) {
    setError(null);
    try {
      const updated = await api.updateCandidateFields(candidate.id, fields);
      setCandidate(updated);
      onUpdated(updated);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      throw err;
    }
  }

  async function handleReject(reason: string) {
    const updated = await api.rejectCandidate(candidate.id, reason);
    setCandidate(updated);
    onUpdated(updated);
  }

  // An interview round's outcome drives what happens next: "rejected" moves
  // the candidate straight to the Rejected column (no separate prompt —
  // that's already a considered decision by the time it's saved here);
  // "cleared" asks whether they're selected for the final decision or need
  // another round, since either is a legitimate next step.
  async function handleSaveInterviewRounds(rounds: InterviewRound[]) {
    const previousOutcomeByName = new Map(candidate.interview_rounds.map((r) => [r.round_name, r.outcome]));
    const updated = await saveFields({ interview_rounds: rounds });
    if (!updated || updated.status !== "active") return updated;

    const newlyRejected = rounds.find((r) => r.outcome === "rejected" && previousOutcomeByName.get(r.round_name) !== "rejected");
    if (newlyRejected) {
      const reason = newlyRejected.notes?.trim()
        ? `Interview round "${newlyRejected.round_name}" — ${newlyRejected.notes.trim()}`
        : `Did not clear interview round: ${newlyRejected.round_name}`;
      await handleReject(reason);
      return updated;
    }

    const newlyCleared = rounds.find((r) => r.outcome === "cleared" && previousOutcomeByName.get(r.round_name) !== "cleared");
    if (newlyCleared && updated.current_stage === "interview") {
      setClearedRound(newlyCleared);
    }
    return updated;
  }

  async function handleMoveToSelected() {
    const updated = await api.moveCandidateStage(candidate.id, "selected_awaiting_final_details");
    setCandidate(updated);
    onUpdated(updated);
  }

  async function handleNeedsAnotherRound() {
    if (!clearedRound) return;
    const updated = await api.notifyNextRound(candidate.id, clearedRound.round_name);
    setCandidate(updated);
    onUpdated(updated);
  }

  async function handleClearFollowup() {
    setError(null);
    try {
      const updated = await api.clearFollowupFlag(candidate.id);
      setCandidate(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleRestore() {
    setError(null);
    try {
      const updated = await api.restoreCandidate(candidate.id);
      setCandidate(updated);
      setCorrectionStage(updated.current_stage);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleMoveStageCorrection() {
    setError(null);
    try {
      const updated = await api.moveCandidateStage(candidate.id, correctionStage);
      setCandidate(updated);
      setCorrectionStage(updated.current_stage);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleCancelPendingEmail() {
    if (!pendingEmail) return;
    setError(null);
    try {
      await api.cancelPendingEmail(pendingEmail.id);
      onUpdated(candidate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleSetOnHold(note: string) {
    const updated = await api.setCandidateOnHold(candidate.id, note);
    setCandidate(updated);
    onUpdated(updated);
  }

  async function handleClearOnHold() {
    setError(null);
    try {
      const updated = await api.clearCandidateOnHold(candidate.id);
      setCandidate(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Modal title={`${candidate.candidate_code} — ${candidate.name}`} onClose={onClose} wide>
      <div className="max-h-[75vh] overflow-y-auto pr-1">
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {pendingEmail && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <span>
              Email pending — &ldquo;{pendingEmail.subject}&rdquo; sends at{" "}
              {new Date(pendingEmail.scheduled_send_at).toLocaleTimeString()}
            </span>
            <button onClick={handleCancelPendingEmail} className="whitespace-nowrap font-medium underline">
              Cancel
            </button>
          </div>
        )}

        {candidate.manual_followup_note && (
          <div className="mb-3 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            <p className="mb-1">⚠ Needs manual follow-up: {candidate.manual_followup_note}</p>
            <button onClick={handleClearFollowup} className="font-medium underline">
              Mark as handled
            </button>
          </div>
        )}

        {candidate.on_hold && (
          <div className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            <p className="mb-1">⏸ On hold: {candidate.on_hold_note}</p>
            <button onClick={handleClearOnHold} className="font-medium underline">
              Clear hold
            </button>
          </div>
        )}

        <SectionCard title="Overview">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-900 dark:text-slate-100">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Requisition: </span>
              {requisition ? `${requisition.req_code} — ${requisition.title}` : "—"}
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Position / Dept / Location: </span>
              {[requisition?.title, requisition?.department, requisition?.location].filter(Boolean).join(" / ")}
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Current stage: </span>
              {STAGE_LABELS[candidate.current_stage]}
              {candidate.status === "rejected" && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                  Rejected from {candidate.rejected_from_stage ? STAGE_LABELS[candidate.rejected_from_stage as keyof typeof STAGE_LABELS] ?? candidate.rejected_from_stage : "?"}
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Stage entered: </span>
              {new Date(candidate.stage_entered_at).toLocaleString()}
            </div>
          </div>

          {candidate.status === "rejected" && (
            <>
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">Reason: {candidate.rejection_reason}</p>
              <button
                onClick={handleRestore}
                className="mt-2 rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              >
                Restore candidate
              </button>
            </>
          )}

          {candidate.status === "active" && (
            <div className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
              <Field label="Move to stage (corrections — e.g. moving a candidate back)">
                <select
                  className={inputClass}
                  value={correctionStage}
                  onChange={(e) => setCorrectionStage(e.target.value as Stage)}
                >
                  {STAGE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                onClick={handleMoveStageCorrection}
                disabled={correctionStage === candidate.current_stage}
                className="mb-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Move
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Candidate & contact">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                defaultValue={candidate.name}
                onBlur={(e) => e.target.value !== candidate.name && saveFields({ name: e.target.value })}
              />
            </Field>
            <Field label="Owner (Recruiter)">
              <input
                className={inputClass}
                defaultValue={candidate.owner}
                onBlur={(e) => e.target.value !== candidate.owner && saveFields({ owner: e.target.value })}
              />
            </Field>
            <Field label="Owner email">
              <input
                className={inputClass}
                defaultValue={candidate.owner_email ?? ""}
                onBlur={(e) => e.target.value !== candidate.owner_email && saveFields({ owner_email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                defaultValue={candidate.phone ?? ""}
                onBlur={(e) => e.target.value !== candidate.phone && saveFields({ phone: e.target.value })}
              />
            </Field>
            <Field label="Personal email">
              <input
                className={inputClass}
                defaultValue={candidate.personal_email ?? ""}
                onBlur={(e) => e.target.value !== candidate.personal_email && saveFields({ personal_email: e.target.value })}
              />
            </Field>
            <Field label="Hiring Manager">
              <input
                className={inputClass}
                defaultValue={candidate.hiring_manager ?? ""}
                onBlur={(e) => e.target.value !== candidate.hiring_manager && saveFields({ hiring_manager: e.target.value })}
              />
            </Field>
            <Field label="Current employer HR email (for BGV)">
              <input
                className={inputClass}
                defaultValue={candidate.current_employer_hr_email ?? ""}
                onBlur={(e) =>
                  e.target.value !== candidate.current_employer_hr_email &&
                  saveFields({ current_employer_hr_email: e.target.value })
                }
              />
            </Field>
            <Field label="TAT status">
              <select
                className={inputClass}
                defaultValue={candidate.tat_status}
                onChange={(e) => saveFields({ tat_status: e.target.value })}
              >
                <option value="on_track">On track</option>
                <option value="at_risk">At risk</option>
                <option value="breached">Breached</option>
              </select>
            </Field>
            <Field label="Priority">
              <select
                className={inputClass}
                defaultValue={candidate.priority ?? ""}
                onChange={(e) => saveFields({ priority: e.target.value || null })}
              >
                <option value="">None</option>
                {CANDIDATE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Candidate track: <strong>{candidate.candidate_track === "experienced" ? "Experienced" : "Intern/Fresher"}</strong>
            {candidate.track_override_reason && ` (overridden: ${candidate.track_override_reason})`}
          </div>
        </SectionCard>

        <SectionCard title="Compensation, location & source">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current location">
              <input
                className={inputClass}
                defaultValue={candidate.current_location ?? ""}
                onBlur={(e) => e.target.value !== candidate.current_location && saveFields({ current_location: e.target.value })}
              />
            </Field>
            <Field label="Source">
              <select
                className={inputClass}
                defaultValue={candidate.source ?? ""}
                onChange={(e) => saveFields({ source: e.target.value || null })}
              >
                <option value="">— Unset —</option>
                {CANDIDATE_SOURCE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {CANDIDATE_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notice period">
              <input
                className={inputClass}
                placeholder="e.g. 30 days"
                defaultValue={candidate.notice_period ?? ""}
                onBlur={(e) => e.target.value !== candidate.notice_period && saveFields({ notice_period: e.target.value })}
              />
            </Field>
            <Field label="Relevant experience (years)">
              <input
                type="number"
                min={0}
                step={0.5}
                className={inputClass}
                defaultValue={candidate.relevant_experience_years ?? ""}
                onBlur={(e) => {
                  const value = e.target.value ? Number(e.target.value) : null;
                  if (value !== candidate.relevant_experience_years) saveFields({ relevant_experience_years: value });
                }}
              />
            </Field>
            <Field label="Current CTC">
              <input
                className={inputClass}
                defaultValue={candidate.current_ctc ?? ""}
                onBlur={(e) => e.target.value !== candidate.current_ctc && saveFields({ current_ctc: e.target.value })}
              />
            </Field>
            <Field label="Expected CTC">
              <input
                className={inputClass}
                defaultValue={candidate.expected_ctc ?? ""}
                onBlur={(e) => e.target.value !== candidate.expected_ctc && saveFields({ expected_ctc: e.target.value })}
              />
            </Field>
            <Field label="LinkedIn URL">
              <input
                className={inputClass}
                defaultValue={candidate.linkedin_url ?? ""}
                onBlur={(e) => e.target.value !== candidate.linkedin_url && saveFields({ linkedin_url: e.target.value })}
              />
            </Field>
            <Field label="Portfolio URL">
              <input
                className={inputClass}
                defaultValue={candidate.portfolio_url ?? ""}
                onBlur={(e) => e.target.value !== candidate.portfolio_url && saveFields({ portfolio_url: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Reason for change">
            <textarea
              className={inputClass}
              rows={2}
              defaultValue={candidate.reason_for_change ?? ""}
              onBlur={(e) => e.target.value !== candidate.reason_for_change && saveFields({ reason_for_change: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <textarea
              className={inputClass}
              rows={2}
              defaultValue={candidate.notes ?? ""}
              onBlur={(e) => e.target.value !== candidate.notes && saveFields({ notes: e.target.value })}
            />
          </Field>
        </SectionCard>

        <CustomFieldsFields
          definitions={customFieldDefinitions}
          values={candidate.custom_fields ?? {}}
          onChange={(next) => saveFields({ custom_fields: next })}
        />

        <PhotoSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <ResumeSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <InterviewRoundsSection candidate={candidate} onSave={handleSaveInterviewRounds} />

        <FinalDetailsSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <OfferStepsSection
          candidate={candidate}
          onSave={(steps) => saveFields({ offer_steps: steps })}
          setCandidate={(c) => { setCandidate(c); onUpdated(c); }}
        />

        <EmploymentHistorySection candidate={candidate} onSave={(rows) => saveFields({ employment_history: rows })} />

        <ReferencesSection candidate={candidate} onSave={(rows) => saveFields({ reference_records: rows })} />

        <ReferenceExceptionSection
          candidate={candidate}
          setCandidate={(c) => { setCandidate(c); onUpdated(c); }}
        />

        <ApprovalsSection candidate={candidate} onSave={(approvals) => saveFields({ offer_document_approvals: approvals })} />

        <EmployeeAgreementPdfSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <HrmsHandoverSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <TimelineSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <SectionCard title="Activity / audit log" collapsible defaultOpen={false}>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {[...candidate.audit_log].reverse().map((entry, i) => (
              <li key={i}>
                <span className="text-slate-400 dark:text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>{" "}
                — <strong>{entry.actor}</strong>: {entry.action}
                {entry.details ? ` (${entry.details})` : ""}
              </li>
            ))}
            {candidate.audit_log.length === 0 && <li className="text-slate-400 dark:text-slate-500">No activity yet.</li>}
          </ul>
        </SectionCard>

        {candidate.status === "active" && (
          <div className="flex gap-2">
            {!candidate.on_hold && (
              <button
                onClick={() => setShowOnHold(true)}
                className="w-full rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950"
              >
                Put on hold
              </button>
            )}
            <button
              onClick={() => setShowReject(true)}
              className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              Reject candidate
            </button>
          </div>
        )}
      </div>

      {showReject && (
        <RejectModal candidateName={candidate.name} onClose={() => setShowReject(false)} onConfirm={handleReject} />
      )}
      {showOnHold && (
        <OnHoldModal candidateName={candidate.name} onClose={() => setShowOnHold(false)} onConfirm={handleSetOnHold} />
      )}
      {clearedRound && (
        <InterviewClearedModal
          candidateName={candidate.name}
          roundName={clearedRound.round_name}
          onClose={() => setClearedRound(null)}
          onMoveToSelected={handleMoveToSelected}
          onNeedsAnotherRound={handleNeedsAnotherRound}
        />
      )}
    </Modal>
  );
}

function PhotoSection({
  candidate,
  setCandidate,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const updated = await api.uploadPhoto(candidate.id, file);
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      const updated = await api.deletePhoto(candidate.id);
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <SectionCard title="Candidate photo">
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {candidate.photo_filename ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/candidates/${candidate.id}/photo`}
            alt={candidate.name}
            className="h-16 w-16 rounded-md border border-slate-200 object-cover dark:border-slate-700"
          />
          <div className="flex flex-col gap-1 text-xs">
            <span className="truncate text-slate-700 dark:text-slate-300">{candidate.photo_filename}</span>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                {uploading ? "Uploading…" : "Replace"}
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" disabled={uploading} onChange={handleFileChange} />
              </label>
              <button onClick={handleRemove} className="font-medium text-red-500 hover:underline dark:text-red-400">
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
          {uploading ? "Uploading…" : "+ Upload photo (JPG or PNG)"}
          <input type="file" accept=".jpg,.jpeg,.png" className="hidden" disabled={uploading} onChange={handleFileChange} />
        </label>
      )}
    </SectionCard>
  );
}

function ResumeSection({
  candidate,
  setCandidate,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const updated = await api.uploadResume(candidate.id, file);
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      const updated = await api.deleteResume(candidate.id);
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <SectionCard title="Resume">
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {candidate.resume_filename ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 p-2 text-sm dark:border-slate-700">
          <a
            href={`/api/candidates/${candidate.id}/resume`}
            className="truncate text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            {candidate.resume_filename}
          </a>
          <div className="flex shrink-0 items-center gap-3">
            <label className="cursor-pointer text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              {uploading ? "Uploading…" : "Replace"}
              <input type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={uploading} onChange={handleFileChange} />
            </label>
            <button onClick={handleRemove} className="text-xs font-medium text-red-500 hover:underline dark:text-red-400">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
          {uploading ? "Uploading…" : "+ Upload resume (PDF or Word)"}
          <input type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={uploading} onChange={handleFileChange} />
        </label>
      )}
    </SectionCard>
  );
}

function IntakeDocumentField({
  candidate,
  setCandidate,
  kind,
  label,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
  kind: "education_proof" | "id_proof" | "salary_slip";
  label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filename = candidate[`${kind}_filename` as const] as string | null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const updated = await api.uploadCandidateDocument(candidate.id, kind, file);
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      const updated = await api.deleteCandidateDocument(candidate.id, kind);
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Field label={label}>
      {error && <p className="mb-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {filename ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 p-2 text-xs dark:border-slate-700">
          <a
            href={`/api/candidates/${candidate.id}/documents/${kind}`}
            className="truncate text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            {filename}
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <label className="cursor-pointer font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              {uploading ? "Uploading…" : "Replace"}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading} onChange={handleFileChange} />
            </label>
            <button onClick={handleRemove} className="font-medium text-red-500 hover:underline dark:text-red-400">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
          {uploading ? "Uploading…" : "+ Upload"}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading} onChange={handleFileChange} />
        </label>
      )}
    </Field>
  );
}

function FinalDetailsSection({
  candidate,
  setCandidate,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
}) {
  const [compensation, setCompensation] = useState(candidate.final_compensation ?? "");
  const [doj, setDoj] = useState(candidate.final_doj ?? "");
  const [designation, setDesignation] = useState(candidate.final_designation ?? "");
  const [location, setLocation] = useState(candidate.final_location ?? "");
  const [benefits, setBenefits] = useState(candidate.final_benefits ?? "");
  const [notes, setNotes] = useState(candidate.final_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const locked = candidate.final_details_locked;

  async function confirmAndLock() {
    setError(null);
    try {
      const updated = await api.confirmFinalDetails(candidate.id, {
        final_compensation: compensation,
        final_doj: doj,
        final_designation: designation,
        final_location: location,
        final_benefits: benefits,
        final_notes: notes,
      });
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <SectionCard title="Final offer details">
      <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
        Agreed after the post-interview call and negotiation — confirmed once, then written into the pre-offer email.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Compensation">
          <input className={inputClass} disabled={locked} value={compensation} onChange={(e) => setCompensation(e.target.value)} />
        </Field>
        <Field label="Date of Joining">
          <input type="date" className={inputClass} disabled={locked} value={doj} onChange={(e) => setDoj(e.target.value)} />
        </Field>
        <Field label="Designation">
          <input className={inputClass} disabled={locked} value={designation} onChange={(e) => setDesignation(e.target.value)} />
        </Field>
        <Field label="Joining location">
          <input className={inputClass} disabled={locked} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
      </div>
      <Field label="Other benefits / perks (optional)">
        <input className={inputClass} disabled={locked} value={benefits} onChange={(e) => setBenefits(e.target.value)} />
      </Field>
      <Field label="Notes — special-case exceptions (optional)">
        <input className={inputClass} disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {locked ? (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Confirmed and locked by Hiring Manager + HR Management.</p>
      ) : (
        <button
          onClick={confirmAndLock}
          className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Confirm & lock final details
        </button>
      )}
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        Must be confirmed before the card can move to Offer Process.
      </p>

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
        <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
          Step 1 (Pre-Offer Formalities) intake documents
        </p>
        <div className="grid grid-cols-3 gap-3">
          <IntakeDocumentField candidate={candidate} setCandidate={setCandidate} kind="education_proof" label="Education proof" />
          <IntakeDocumentField candidate={candidate} setCandidate={setCandidate} kind="id_proof" label="Government ID proof" />
          <IntakeDocumentField candidate={candidate} setCandidate={setCandidate} kind="salary_slip" label="Salary slip" />
        </div>
      </div>
    </SectionCard>
  );
}

function InterviewRoundsSection({
  candidate,
  onSave,
}: {
  candidate: Candidate;
  onSave: (rounds: InterviewRound[]) => Promise<Candidate | undefined>;
}) {
  const [rounds, setRounds] = useState<InterviewRound[]>(candidate.interview_rounds);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<InterviewRound>) {
    setSaved(false);
    setRounds((r) => r.map((round, idx) => (idx === i ? { ...round, ...patch } : round)));
  }

  return (
    <SectionCard title="Interview round tags">
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        Populated automatically when an interview is scheduled from the Interviews page. Outcome and notes can still
        be edited here after the interview happens.
      </p>
      {rounds.map((r, i) => (
        <div key={i} className="mb-3 rounded-md border border-slate-100 p-2 dark:border-slate-700">
          <div className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
            <input className={inputClass} placeholder="Round (e.g. L1)" value={r.round_name} onChange={(e) => update(i, { round_name: e.target.value })} />
            <select className={inputClass} value={r.outcome} onChange={(e) => update(i, { outcome: e.target.value as InterviewRound["outcome"] })}>
              <option value="scheduled">Scheduled</option>
              <option value="cleared">Cleared</option>
              <option value="rejected">Rejected</option>
            </select>
            <input className={inputClass} placeholder="Notes" value={r.notes ?? ""} onChange={(e) => update(i, { notes: e.target.value })} />
            <button onClick={() => { setSaved(false); setRounds((rs) => rs.filter((_, idx) => idx !== i)); }} className="text-xs text-red-500 dark:text-red-400">
              Remove
            </button>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
            <input
              className={inputClass}
              placeholder="Panelist emails, comma-separated"
              value={r.panelist_emails ?? ""}
              onChange={(e) => update(i, { panelist_emails: e.target.value })}
            />
            <input
              type="datetime-local"
              className={inputClass}
              title="Scheduled date/time"
              value={toDatetimeLocalValue(r.scheduled_at)}
              onChange={(e) => update(i, { scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            />
            <select
              className={inputClass}
              title="Duration"
              value={r.duration_minutes ?? 30}
              onChange={(e) => update(i, { duration_minutes: Number(e.target.value) })}
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
          {r.scheduled_at && (
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {formatRoundWindow(r.scheduled_at, r.duration_minutes ?? 30)}
            </p>
          )}
        </div>
      ))}
      {rounds.length === 0 && (
        <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">No interviews scheduled yet.</p>
      )}
      <div>
        <SaveButton saved={saved} onClick={async () => { await onSave(rounds); setSaved(true); }} />
      </div>
    </SectionCard>
  );
}

function EmploymentHistorySection({
  candidate,
  onSave,
}: {
  candidate: Candidate;
  onSave: (rows: EmploymentHistoryEntry[]) => Promise<Candidate | undefined>;
}) {
  const [rows, setRows] = useState<EmploymentHistoryEntry[]>(candidate.employment_history);
  const [saved, setSaved] = useState(false);
  const isFresherIntern = candidate.candidate_track === "fresher_intern";

  function update(i: number, patch: Partial<EmploymentHistoryEntry>) {
    setSaved(false);
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // Exclusive — only one entry can be the current employer, since it's what
  // resolves the HR BGV (Step 4) recipient.
  function setCurrent(i: number) {
    setSaved(false);
    setRows((rs) => rs.map((r, idx) => ({ ...r, is_current: idx === i })));
  }

  return (
    <SectionCard title={isFresherIntern ? "Academic / internship history" : "Employment history (one per employer relevant to a reference)"}>
      {rows.map((r, i) => (
        <div key={r.id} className="mb-3 rounded-md border border-slate-100 p-2 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              placeholder={isFresherIntern ? "Institution / company" : "Company name"}
              value={r.company_name}
              onChange={(e) => update(i, { company_name: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder={isFresherIntern ? "Course / program" : "Designation"}
              value={r.designation}
              onChange={(e) => update(i, { designation: e.target.value })}
            />
            <input className={inputClass} placeholder="Tenure from" value={r.tenure_from} onChange={(e) => update(i, { tenure_from: e.target.value })} />
            <input className={inputClass} placeholder="Tenure to" value={r.tenure_to} onChange={(e) => update(i, { tenure_to: e.target.value })} />
            <input className={inputClass} placeholder="Employee code" value={r.employee_code} onChange={(e) => update(i, { employee_code: e.target.value })} />
            <input
              className={inputClass}
              placeholder={isFresherIntern ? "Faculty / mentor" : "Supervisor name"}
              value={r.supervisor_name}
              onChange={(e) => update(i, { supervisor_name: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Reference-check email (work email)"
              value={r.email}
              onChange={(e) => update(i, { email: e.target.value })}
            />
          </div>
          {!isFresherIntern && (
            <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={!!r.is_current} onChange={() => setCurrent(i)} />
              Current employer (used for HR Background Verification, Step 4)
            </label>
          )}
          <button onClick={() => { setSaved(false); setRows((rs) => rs.filter((_, idx) => idx !== i)); }} className="mt-1 text-xs text-red-500 dark:text-red-400">
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          { setSaved(false); setRows((rs) => [
            ...rs,
            { id: newId(), company_name: "", tenure_from: "", tenure_to: "", employee_code: "", designation: "", supervisor_name: "", email: "", is_current: false },
          ]); }
        }
        className="text-xs font-medium text-slate-600 underline dark:text-slate-400"
      >
        + Add employer
      </button>
      <div>
        <SaveButton saved={saved} onClick={async () => { await onSave(rows); setSaved(true); }} />
      </div>
    </SectionCard>
  );
}

function ReferencesSection({
  candidate,
  onSave,
}: {
  candidate: Candidate;
  onSave: (rows: ReferenceRecord[]) => Promise<Candidate | undefined>;
}) {
  const [rows, setRows] = useState<ReferenceRecord[]>(candidate.reference_records);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<ReferenceRecord>) {
    setSaved(false);
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <SectionCard title="Reference records (up to 3, min. 2 with approval)">
      {rows.map((r, i) => (
        <div key={r.id} className="mb-3 rounded-md border border-slate-100 p-2 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Name" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            <input className={inputClass} placeholder="Email" value={r.email} onChange={(e) => update(i, { email: e.target.value })} />
            <input className={inputClass} placeholder="Phone" value={r.phone} onChange={(e) => update(i, { phone: e.target.value })} />
            <select
              className={inputClass}
              value={r.linked_employment_history_id ?? ""}
              onChange={(e) => update(i, { linked_employment_history_id: e.target.value || null })}
            >
              <option value="">Academic / other</option>
              {candidate.employment_history.map((eh) => (
                <option key={eh.id} value={eh.id}>
                  {eh.company_name || "(unnamed employer)"}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={r.verification_status}
              onChange={(e) => update(i, { verification_status: e.target.value as ReferenceRecord["verification_status"] })}
            >
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="na">N/A</option>
            </select>
          </div>
          {r.document_pathname && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Reference-check document sent{r.document_sent_at ? ` ${new Date(r.document_sent_at).toLocaleDateString()}` : ""} —{" "}
              <a
                href={`/api/candidates/${candidate.id}/reference-documents/${r.id}`}
                className="font-medium text-indigo-600 underline dark:text-indigo-400"
              >
                download
              </a>
            </p>
          )}
          <button onClick={() => { setSaved(false); setRows((rs) => rs.filter((_, idx) => idx !== i)); }} className="mt-1 text-xs text-red-500 dark:text-red-400">
            Remove
          </button>
        </div>
      ))}
      {rows.length < 3 && (
        <button
          type="button"
          onClick={() =>
            { setSaved(false); setRows((rs) => [
              ...rs,
              { id: newId(), name: "", email: "", phone: "", linked_employment_history_id: null, verification_status: "pending" },
            ]); }
          }
          className="text-xs font-medium text-slate-600 underline dark:text-slate-400"
        >
          + Add reference
        </button>
      )}
      <div>
        <SaveButton saved={saved} onClick={async () => { await onSave(rows); setSaved(true); }} />
      </div>
    </SectionCard>
  );
}

function ReferenceExceptionSection({
  candidate,
  setCandidate,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const exception = candidate.reference_exception;

  async function request() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    try {
      setCandidate(await api.requestReferenceException(candidate.id, reason));
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function decide(decision: "approved" | "denied") {
    setError(null);
    try {
      setCandidate(await api.decideReferenceException(candidate.id, decision));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (candidate.reference_records.length >= 3 && exception.status === "none") return null;

  return (
    <SectionCard title="2-reference exception (Section 7.6)">
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {exception.status === "none" || exception.status === "denied" ? (
        <>
          {exception.status === "denied" && (
            <p className="mb-2 text-xs text-red-600 dark:text-red-400">
              Previously denied by {exception.decided_by} on {exception.decided_at ? new Date(exception.decided_at).toLocaleString() : "?"}.
            </p>
          )}
          <Field label="Reason (e.g. limited professional network, short tenure history)">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button onClick={request} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            Request exception
          </button>
        </>
      ) : exception.status === "pending" ? (
        <>
          <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
            Requested by {exception.requested_by} on {new Date(exception.requested_at!).toLocaleString()}: &ldquo;{exception.reason}&rdquo;
          </p>
          <div className="flex gap-2">
            <button onClick={() => decide("approved")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
              Approve
            </button>
            <button onClick={() => decide("denied")} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950">
              Deny
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Approved by {exception.decided_by} on {new Date(exception.decided_at!).toLocaleString()}. Step 2 can complete with 2 references.
        </p>
      )}
    </SectionCard>
  );
}

function GraceExtensionControls({
  candidate,
  step,
  setCandidate,
}: {
  candidate: Candidate;
  step: OfferStep;
  setCandidate: (c: Candidate) => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [hours, setHours] = useState(48);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = pendingGraceExtension(step);

  async function submitRequest() {
    setError(null);
    if (!reason.trim() || !hours || hours <= 0) {
      setError("A reason and positive hours are required.");
      return;
    }
    try {
      setCandidate(await api.requestGraceExtension(candidate.id, step.step_number, hours, reason));
      setRequesting(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function decide(decision: "approved" | "denied") {
    setError(null);
    try {
      setCandidate(await api.decideGraceExtension(candidate.id, step.step_number, decision));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (pending) {
    return (
      <div className="col-span-4 mt-1 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        {error && <p className="mb-1 text-red-600 dark:text-red-400">{error}</p>}
        Grace extension requested by {pending.requested_by}: new TAT {pending.requested_tat_hours}h. Reason: {pending.reason}
        <div className="mt-1 flex gap-2">
          <button onClick={() => decide("approved")} className="rounded bg-emerald-600 px-2 py-0.5 font-medium text-white hover:bg-emerald-700">
            Approve
          </button>
          <button onClick={() => decide("denied")} className="rounded border border-red-300 px-2 py-0.5 font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950">
            Deny
          </button>
        </div>
      </div>
    );
  }

  if (requesting) {
    return (
      <div className="col-span-4 mt-1 flex items-center gap-2">
        {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        <input
          type="number"
          className={`${inputClass} w-20`}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          placeholder="New TAT (h)"
        />
        <input className={inputClass} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button onClick={submitRequest} className="whitespace-nowrap rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
          Submit
        </button>
        <button onClick={() => setRequesting(false)} className="whitespace-nowrap text-[11px] text-slate-500 underline dark:text-slate-400">
          Cancel
        </button>
      </div>
    );
  }

  if (step.status !== "in_progress") return null;

  return (
    <button onClick={() => setRequesting(true)} className="col-span-4 mt-1 text-left text-[11px] text-slate-500 underline dark:text-slate-400">
      + Request grace extension
    </button>
  );
}

const STEP_TAT_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  breached: "Breached",
};

const STEP_TAT_CLASS: Record<string, string> = {
  on_track: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  at_risk: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  breached: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

function OfferStepsSection({
  candidate,
  onSave,
  setCandidate,
}: {
  candidate: Candidate;
  onSave: (steps: OfferStep[]) => Promise<Candidate | undefined>;
  setCandidate: (c: Candidate) => void;
}) {
  const [steps, setSteps] = useState<OfferStep[]>(candidate.offer_steps);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<OfferStep>) {
    setSaved(false);
    setSteps((ss) =>
      ss.map((s, idx) =>
        idx === i
          ? { ...s, ...patch, completed_at: patch.status === "complete" ? new Date().toISOString() : s.completed_at }
          : s
      )
    );
  }

  return (
    <SectionCard title="Offer sub-stage checklist (Steps 1–5)">
      {steps.map((s, i) => {
        const tat = computeStepTatStatus(s);
        const effHours = effectiveTatHours(s);
        return (
          <div key={s.step_number} className="mb-2 grid grid-cols-4 items-center gap-2">
            <span className="text-xs text-slate-700 dark:text-slate-300">
              {s.step_number}. {s.step_name}
            </span>
            <select
              className={inputClass}
              disabled={s.status === "na"}
              value={s.status}
              onChange={(e) => update(i, { status: e.target.value as OfferStep["status"] })}
            >
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
              <option value="na">N/A</option>
            </select>
            <input className={inputClass} placeholder="Owner" value={s.owner} onChange={(e) => update(i, { owner: e.target.value })} />
            <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
              {tat && (
                <span className={`rounded-full px-1.5 py-0.5 font-medium ${STEP_TAT_CLASS[tat]}`}>
                  {STEP_TAT_LABEL[tat]} ({effHours}h)
                </span>
              )}
              {s.completed_at && <span>{new Date(s.completed_at).toLocaleDateString()}</span>}
            </div>
            {/* Grace extensions apply to the saved candidate state (server-authoritative timestamps), not the unsaved local edit buffer above. */}
            <GraceExtensionControls
              candidate={candidate}
              step={candidate.offer_steps[i] ?? s}
              setCandidate={(c) => { setCandidate(c); setSteps(c.offer_steps); }}
            />
          </div>
        );
      })}
      {candidate.candidate_track === "experienced" && candidate.bgv_document_pathname && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          HR BGV document sent —{" "}
          <a href={`/api/candidates/${candidate.id}/bgv-document`} className="font-medium text-indigo-600 underline dark:text-indigo-400">
            download
          </a>
        </p>
      )}
      <div>
        <SaveButton saved={saved} onClick={async () => { await onSave(steps); setSaved(true); }} />
      </div>
    </SectionCard>
  );
}

// version is an auto-incrementing revision counter, bumped whenever
// review_status transitions into "pending" (Under Review) — the recruiter
// never types it directly. Tolerant of legacy non-numeric values.
function nextVersion(current: string): string {
  const n = parseInt(current, 10);
  return String(Number.isFinite(n) ? n + 1 : 1);
}

function ApprovalRow({
  label,
  value,
  onChange,
  showSignature,
}: {
  label: string;
  value: OfferDocumentApproval | undefined;
  onChange: (v: OfferDocumentApproval) => void;
  showSignature?: boolean;
}) {
  // Spread defaults first so a legacy candidate row saved before doc_link
  // existed (missing the field entirely, not just the whole object) still
  // renders a controlled input instead of `undefined`.
  const v: OfferDocumentApproval = { doc_link: "", version: "", review_status: "pending", reviewer_comments: "", ...value };
  return (
    <div className="mb-3 rounded-md border border-slate-100 p-2 dark:border-slate-700">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
        {v.version && <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">v{v.version}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className={`col-span-2 ${inputClass}`}
          placeholder="Document link (Google Docs / Word)"
          value={v.doc_link}
          onChange={(e) => onChange({ ...v, doc_link: e.target.value })}
        />
        <select
          className={inputClass}
          value={v.review_status}
          onChange={(e) => {
            const nextStatus = e.target.value as OfferDocumentApproval["review_status"];
            // A genuine transition into "Under Review" — first submission
            // or a resubmission after changes — bumps the revision counter,
            // same moment the notification-triggering diff (in
            // detectDocumentApprovalEvents) fires on save.
            const enteringReview = nextStatus === "pending" && v.review_status !== "pending";
            onChange({ ...v, review_status: nextStatus, version: enteringReview ? nextVersion(v.version) : v.version });
          }}
        >
          <option value="pending">Under Review</option>
          <option value="changes_requested">Changes requested</option>
          <option value="approved">Approved</option>
        </select>
        <input
          className={`col-span-2 ${inputClass}`}
          placeholder="Reviewer comments"
          value={v.reviewer_comments}
          onChange={(e) => onChange({ ...v, reviewer_comments: e.target.value })}
        />
        {showSignature && (
          <select
            className={inputClass}
            value={v.signature_status ?? "pending"}
            onChange={(e) => onChange({ ...v, signature_status: e.target.value as "pending" | "signed" })}
          >
            <option value="pending">Signature pending</option>
            <option value="signed">Signed</option>
          </select>
        )}
      </div>
    </div>
  );
}

function ApprovalsSection({
  candidate,
  onSave,
}: {
  candidate: Candidate;
  onSave: (approvals: Candidate["offer_document_approvals"]) => Promise<Candidate | undefined>;
}) {
  const [approvals, setApprovals] = useState(candidate.offer_document_approvals);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Employee Agreement PDF (EmployeeAgreementPdfSection, below) saves
  // via its own dedicated route rather than this section's deferred Save
  // button — resync so an upload there doesn't get silently clobbered by a
  // stale local copy the next time this section's Save is clicked.
  useEffect(() => {
    setApprovals(candidate.offer_document_approvals);
  }, [candidate.offer_document_approvals]);

  async function handleSave() {
    setError(null);
    const missingLink = (["offer_letter", "employee_agreement"] as const).find(
      (docType) => approvals[docType]?.review_status === "pending" && !approvals[docType]?.doc_link
    );
    if (missingLink) {
      setError(
        `Add a document link before marking ${missingLink === "offer_letter" ? "the Offer Letter" : "the Employee Agreement"} Under Review.`
      );
      return;
    }
    await onSave(approvals);
    setSaved(true);
  }

  return (
    <SectionCard title="Offer document approval status">
      <ApprovalRow
        label="Offer Letter"
        value={approvals.offer_letter}
        onChange={(v) => { setSaved(false); setApprovals((a) => ({ ...a, offer_letter: v })); }}
      />
      <ApprovalRow
        label="Employee Agreement"
        value={approvals.employee_agreement}
        showSignature
        onChange={(v) => { setSaved(false); setApprovals((a) => ({ ...a, employee_agreement: v })); }}
      />
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <SaveButton saved={saved} onClick={handleSave} />
    </SectionCard>
  );
}

// Once the Employee Agreement's content is approved (ApprovalsSection
// above), the recruiter uploads the final PDF here; once HR Management has
// signed it externally (e.g. DocuSign), the same control re-uploads the
// signed copy into the same field. Marking it "Signed" is still done via
// the Signature dropdown in ApprovalsSection — that's what actually fires
// the candidate-facing "signed" notification, unchanged from before.
function EmployeeAgreementPdfSection({
  candidate,
  setCandidate,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
}) {
  const approval = candidate.offer_document_approvals.employee_agreement;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (approval?.review_status !== "approved") return null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const updated = await api.uploadEmployeeAgreementPdf(candidate.id, file);
      setCandidate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  const isSigned = approval.signature_status === "signed";

  return (
    <SectionCard title="Employee Agreement — final PDF">
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {approval.final_pdf_filename ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 p-2 text-sm dark:border-slate-700">
          <a
            href={`/api/candidates/${candidate.id}/employee-agreement-pdf`}
            className="truncate text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            {approval.final_pdf_filename}
          </a>
          <label className="shrink-0 cursor-pointer text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            {uploading ? "Uploading…" : isSigned ? "Replace" : "Upload signed copy"}
            <input type="file" accept=".pdf" className="hidden" disabled={uploading} onChange={handleFileChange} />
          </label>
        </div>
      ) : (
        <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
          {uploading ? "Uploading…" : "+ Upload final agreement (PDF)"}
          <input type="file" accept=".pdf" className="hidden" disabled={uploading} onChange={handleFileChange} />
        </label>
      )}
      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
        {approval.final_pdf_filename
          ? isSigned
            ? "Signed and on file."
            : "Uploaded — sign it externally (e.g. DocuSign), then upload the signed copy here, and mark it Signed above."
          : "Once uploaded, HR Management is notified to sign it externally."}
      </p>
    </SectionCard>
  );
}

const HRMS_STATUS_BADGE: Record<"awaiting_acknowledgement" | "acknowledged", string> = {
  awaiting_acknowledgement: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  acknowledged: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
};

// hrms_handover_status is only ever set once a candidate reaches the
// Handover to HRMS stage (see the move_stage handler) — null means they
// haven't gotten there yet, so this section has nothing to show.
function HrmsHandoverSection({
  candidate,
  setCandidate,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
}) {
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = candidate.hrms_handover_status;

  if (!status || status === "not_sent") return null;

  async function handleAcknowledge() {
    setError(null);
    setAcknowledging(true);
    try {
      setCandidate(await api.markHrmsAcknowledged(candidate.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <SectionCard title="Sent to HRMS">
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${HRMS_STATUS_BADGE[status]}`}>
            {HRMS_HANDOVER_STATUS_LABELS[status]}
          </span>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Handed off {candidate.hrms_handed_off_at ? new Date(candidate.hrms_handed_off_at).toLocaleString() : "—"}
            {status === "acknowledged" && candidate.hrms_acknowledged_at
              ? ` · Acknowledged ${new Date(candidate.hrms_acknowledged_at).toLocaleString()}`
              : ""}
          </p>
        </div>
        {status === "awaiting_acknowledgement" && (
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {acknowledging ? "Marking…" : "Mark acknowledged"}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

interface TimelineEntry {
  key: string;
  timestamp: string;
  kind: "stage_move" | "document" | "interview" | "note";
  actor: string;
  headline: string;
  detail?: string;
}

const TIMELINE_KIND_LABEL: Record<TimelineEntry["kind"], string> = {
  stage_move: "Stage move",
  document: "Document",
  interview: "Interview",
  note: "Note",
};

const TIMELINE_KIND_DOT: Record<TimelineEntry["kind"], string> = {
  stage_move: "bg-indigo-400",
  document: "bg-sky-400",
  interview: "bg-violet-400",
  note: "bg-amber-400",
};

// A friendlier, curated subset of audit_log (stage moves, document/resume
// attachments, interview scheduling) merged with candidate_notes — NOT a
// second source of truth. Everything here already lives in audit_log except
// notes; nothing new is logged just for this view. Matches on the same
// action strings every write route already uses (see appendAudit call sites
// across the candidates/resume/photo/documents/employee-agreement routes).
function buildTimeline(candidate: Candidate): TimelineEntry[] {
  const fromAudit = candidate.audit_log
    .map((entry: AuditLogEntry, i): TimelineEntry | null => {
      if (entry.action === "Moved stage") {
        return { key: `audit-${i}`, timestamp: entry.timestamp, kind: "stage_move", actor: entry.actor, headline: entry.details ?? "Moved stage" };
      }
      if (entry.action.startsWith("Uploaded ") || entry.action.startsWith("Removed ")) {
        return { key: `audit-${i}`, timestamp: entry.timestamp, kind: "document", actor: entry.actor, headline: entry.action, detail: entry.details };
      }
      if (entry.action === "Updated fields" && entry.details?.split(", ").includes("interview_rounds")) {
        return { key: `audit-${i}`, timestamp: entry.timestamp, kind: "interview", actor: entry.actor, headline: "Interview round scheduled or updated" };
      }
      return null;
    })
    .filter((e): e is TimelineEntry => e !== null);

  const fromNotes: TimelineEntry[] = candidate.candidate_notes.map((note: CandidateNote, i) => ({
    key: `note-${i}`,
    timestamp: note.created_at,
    kind: "note",
    actor: note.author,
    headline: "Note added",
    detail: note.text,
  }));

  return [...fromAudit, ...fromNotes].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function TimelineSection({
  candidate,
  setCandidate,
}: {
  candidate: Candidate;
  setCandidate: (c: Candidate) => void;
}) {
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.addCandidateNote(candidate.id, noteText);
      setCandidate(updated);
      setNoteText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const entries = buildTimeline(candidate);

  return (
    <SectionCard title="Activity timeline">
      <div className="mb-3">
        <textarea
          className={`${inputClass} min-h-[60px]`}
          placeholder="Add a note…"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={handleAddNote}
            disabled={submitting || !noteText.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? "Adding…" : "Add note"}
          </button>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>

      <ul className="max-h-72 space-y-2.5 overflow-y-auto text-xs">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-start gap-2">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TIMELINE_KIND_DOT[entry.kind]}`} />
            <div className="min-w-0">
              <span className="text-slate-400 dark:text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>{" "}
              <span className="text-slate-400 dark:text-slate-500">· {TIMELINE_KIND_LABEL[entry.kind]} ·</span>{" "}
              <strong className="text-slate-700 dark:text-slate-300">{entry.actor}</strong>: {entry.headline}
              {entry.detail && (
                <span className="text-slate-600 dark:text-slate-400"> — {entry.detail}</span>
              )}
            </div>
          </li>
        ))}
        {entries.length === 0 && <li className="text-slate-400 dark:text-slate-500">No activity yet.</li>}
      </ul>
    </SectionCard>
  );
}
