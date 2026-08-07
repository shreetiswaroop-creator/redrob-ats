"use client";

import { useState } from "react";
import { Modal, Field, inputClass } from "./Modal";
import { RejectModal } from "./RejectModal";
import { OnHoldModal } from "./OnHoldModal";
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
  DocumentRecord,
  OfferDocumentApproval,
} from "@/lib/types";
import { api } from "@/lib/api";
import { computeStepTatStatus, effectiveTatHours, pendingGraceExtension } from "@/lib/tat";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {children}
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
}: {
  candidate: Candidate;
  requisition: Requisition | undefined;
  pendingEmail?: PendingEmailInfo | null;
  onClose: () => void;
  onUpdated: (c: Candidate) => void;
}) {
  const [candidate, setCandidate] = useState(initialCandidate);
  const [showReject, setShowReject] = useState(false);
  const [showOnHold, setShowOnHold] = useState(false);
  const [correctionStage, setCorrectionStage] = useState<Stage>(candidate.current_stage);
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
          </div>
          <Field label="Notes">
            <textarea
              className={inputClass}
              rows={2}
              defaultValue={candidate.notes ?? ""}
              onBlur={(e) => e.target.value !== candidate.notes && saveFields({ notes: e.target.value })}
            />
          </Field>
        </SectionCard>

        <ResumeSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <InterviewRoundsSection candidate={candidate} onSave={(rounds) => saveFields({ interview_rounds: rounds })} />

        <FinalDetailsSection candidate={candidate} setCandidate={(c) => { setCandidate(c); onUpdated(c); }} />

        <EmploymentHistorySection candidate={candidate} onSave={(rows) => saveFields({ employment_history: rows })} />

        <ReferencesSection candidate={candidate} onSave={(rows) => saveFields({ reference_records: rows })} />

        <ReferenceExceptionSection
          candidate={candidate}
          setCandidate={(c) => { setCandidate(c); onUpdated(c); }}
        />

        <OfferStepsSection
          candidate={candidate}
          onSave={(steps) => saveFields({ offer_steps: steps })}
          setCandidate={(c) => { setCandidate(c); onUpdated(c); }}
        />

        <DocumentsSection candidate={candidate} onSave={(docs) => saveFields({ documents: docs })} />

        <ApprovalsSection candidate={candidate} onSave={(approvals) => saveFields({ offer_document_approvals: approvals })} />

        <SectionCard title="Activity / audit log">
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
    </Modal>
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
          <input
            className={`mt-2 ${inputClass}`}
            placeholder="Panelist emails, comma-separated"
            value={r.panelist_emails ?? ""}
            onChange={(e) => update(i, { panelist_emails: e.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => { setSaved(false); setRounds((r) => [...r, { round_name: "", outcome: "scheduled" }]); }}
        className="text-xs font-medium text-slate-600 underline dark:text-slate-400"
      >
        + Add round
      </button>
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

  function update(i: number, patch: Partial<EmploymentHistoryEntry>) {
    setSaved(false);
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <SectionCard title="Employment history (one per employer relevant to a reference)">
      {rows.map((r, i) => (
        <div key={r.id} className="mb-3 rounded-md border border-slate-100 p-2 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Company name" value={r.company_name} onChange={(e) => update(i, { company_name: e.target.value })} />
            <input className={inputClass} placeholder="Designation" value={r.designation} onChange={(e) => update(i, { designation: e.target.value })} />
            <input className={inputClass} placeholder="Tenure from" value={r.tenure_from} onChange={(e) => update(i, { tenure_from: e.target.value })} />
            <input className={inputClass} placeholder="Tenure to" value={r.tenure_to} onChange={(e) => update(i, { tenure_to: e.target.value })} />
            <input className={inputClass} placeholder="Employee code" value={r.employee_code} onChange={(e) => update(i, { employee_code: e.target.value })} />
            <input className={inputClass} placeholder="Supervisor name" value={r.supervisor_name} onChange={(e) => update(i, { supervisor_name: e.target.value })} />
            <input
              className={inputClass}
              placeholder="Reference-check email (work email)"
              value={r.email}
              onChange={(e) => update(i, { email: e.target.value })}
            />
          </div>
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
            { id: newId(), company_name: "", tenure_from: "", tenure_to: "", employee_code: "", designation: "", supervisor_name: "", email: "" },
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
      <div>
        <SaveButton saved={saved} onClick={async () => { await onSave(steps); setSaved(true); }} />
      </div>
    </SectionCard>
  );
}

const DOC_CATEGORIES: DocumentRecord["category"][] = [
  "education_proof",
  "id_proof",
  "salary_slip",
  "passport_photo",
  "reference_response",
  "offer_letter_draft",
  "signed_offer_letter",
  "bgv_response",
  "employee_agreement_draft",
  "signed_agreement",
];

function DocumentsSection({
  candidate,
  onSave,
}: {
  candidate: Candidate;
  onSave: (docs: DocumentRecord[]) => Promise<Candidate | undefined>;
}) {
  const [docs, setDocs] = useState<DocumentRecord[]>(candidate.documents);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<DocumentRecord>) {
    setSaved(false);
    setDocs((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  return (
    <SectionCard title="Document repository">
      {docs.map((d, i) => (
        <div key={d.id} className="mb-2 grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2">
          <select className={inputClass} value={d.category} onChange={(e) => update(i, { category: e.target.value as DocumentRecord["category"] })}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input className={inputClass} placeholder="Name" value={d.name} onChange={(e) => update(i, { name: e.target.value })} />
          <input className={inputClass} placeholder="Link or note" value={d.link_or_note} onChange={(e) => update(i, { link_or_note: e.target.value })} />
          <button onClick={() => { setSaved(false); setDocs((ds) => ds.filter((_, idx) => idx !== i)); }} className="text-xs text-red-500 dark:text-red-400">
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          { setSaved(false); setDocs((ds) => [
            ...ds,
            { id: newId(), category: "education_proof", name: "", link_or_note: "", uploaded_at: new Date().toISOString() },
          ]); }
        }
        className="text-xs font-medium text-slate-600 underline dark:text-slate-400"
      >
        + Add document
      </button>
      <div>
        <SaveButton saved={saved} onClick={async () => { await onSave(docs); setSaved(true); }} />
      </div>
    </SectionCard>
  );
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
  const v: OfferDocumentApproval = value ?? { version: "", review_status: "pending", reviewer_comments: "" };
  return (
    <div className="mb-3 rounded-md border border-slate-100 p-2 dark:border-slate-700">
      <div className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <input className={inputClass} placeholder="Version" value={v.version} onChange={(e) => onChange({ ...v, version: e.target.value })} />
        <select
          className={inputClass}
          value={v.review_status}
          onChange={(e) => onChange({ ...v, review_status: e.target.value as OfferDocumentApproval["review_status"] })}
        >
          <option value="pending">Pending</option>
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
      <SaveButton saved={saved} onClick={async () => { await onSave(approvals); setSaved(true); }} />
    </SectionCard>
  );
}
