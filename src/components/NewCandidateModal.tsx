"use client";

import { useState } from "react";
import { Modal, Field, inputClass } from "./Modal";
import { Candidate, CandidateSource, CANDIDATE_SOURCE_LABELS, CANDIDATE_SOURCE_ORDER, Requisition } from "@/lib/types";
import { api } from "@/lib/api";
import { useActor } from "@/lib/actor-context";

export function NewCandidateModal({
  requisition,
  onClose,
  onCreated,
}: {
  requisition: Requisition;
  onClose: () => void;
  onCreated: (candidate: Candidate) => void;
}) {
  const { user } = useActor();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [currentCtc, setCurrentCtc] = useState("");
  const [expectedCtc, setExpectedCtc] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [source, setSource] = useState<CandidateSource | "">("");
  const [relevantExperienceYears, setRelevantExperienceYears] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideTrack, setOverrideTrack] = useState(false);
  const [track, setTrack] = useState(requisition.position_type);
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Candidate name is required.");
      return;
    }
    if (overrideTrack && !overrideReason.trim()) {
      setError("A reason is required when overriding the candidate track.");
      return;
    }

    setSubmitting(true);
    try {
      const candidate = await api.createCandidate({
        requisition_id: requisition.id,
        name,
        phone: phone || undefined,
        personal_email: email || undefined,
        candidate_track: overrideTrack ? track : undefined,
        track_override_reason: overrideTrack ? overrideReason : undefined,
        notice_period: noticePeriod || undefined,
        current_ctc: currentCtc || undefined,
        expected_ctc: expectedCtc || undefined,
        current_location: currentLocation || undefined,
        source: source || undefined,
        relevant_experience_years: relevantExperienceYears ? Number(relevantExperienceYears) : undefined,
        notes: notes || undefined,
      });
      onCreated(candidate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Add candidate to ${requisition.req_code} — ${requisition.title}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Candidate name *">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Personal email">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Current location">
            <input className={inputClass} value={currentLocation} onChange={(e) => setCurrentLocation(e.target.value)} />
          </Field>
          <Field label="Source">
            <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value as CandidateSource)}>
              <option value="">— Select —</option>
              {CANDIDATE_SOURCE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {CANDIDATE_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Notice period">
            <input className={inputClass} placeholder="e.g. 30 days" value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} />
          </Field>
          <Field label="Relevant experience (years)">
            <input
              type="number"
              min={0}
              step={0.5}
              className={inputClass}
              value={relevantExperienceYears}
              onChange={(e) => setRelevantExperienceYears(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current CTC">
            <input className={inputClass} value={currentCtc} onChange={(e) => setCurrentCtc(e.target.value)} />
          </Field>
          <Field label="Expected CTC">
            <input className={inputClass} value={expectedCtc} onChange={(e) => setExpectedCtc(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Candidate Owner: <span className="font-medium text-slate-700 dark:text-slate-300">{user?.name}</span> ({user?.email}) — tagged
          automatically from your login, per Section 5.1.
        </p>

        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={overrideTrack} onChange={(e) => setOverrideTrack(e.target.checked)} />
          Override candidate track (default: {requisition.position_type === "experienced" ? "Experienced Hire" : "Intern / Fresher"}, inherited from requisition)
        </label>

        {overrideTrack && (
          <>
            <Field label="Candidate track">
              <select
                className={inputClass}
                value={track}
                onChange={(e) => setTrack(e.target.value as "experienced" | "fresher_intern")}
              >
                <option value="experienced">Experienced Hire</option>
                <option value="fresher_intern">Intern / Fresher</option>
              </select>
            </Field>
            <Field label="Reason for override *">
              <input className={inputClass} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </Field>
          </>
        )}

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {submitting ? "Adding…" : "Add candidate"}
        </button>
      </form>
    </Modal>
  );
}
