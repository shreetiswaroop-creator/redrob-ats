"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "./Modal";
import {
  CandidateDuplicateMatch,
  CandidateSource,
  CANDIDATE_SOURCE_LABELS,
  CANDIDATE_SOURCE_ORDER,
  CustomFieldDefinition,
  CustomFieldValues,
  Requisition,
  STAGE_LABELS,
} from "@/lib/types";
import { api } from "@/lib/api";
import { useActor } from "@/lib/actor-context";
import { CustomFieldsFields } from "./CustomFieldsFields";

function formatDupeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
}

function dupeStatusLine(m: CandidateDuplicateMatch): string {
  if (m.status === "rejected") return `Rejected${m.rejection_reason ? ` — ${m.rejection_reason}` : ""}`;
  if (m.on_hold) return `On hold${m.on_hold_note ? ` — ${m.on_hold_note}` : ""}`;
  return `Active — ${STAGE_LABELS[m.stage]}`;
}

export function CandidatesView({
  requisitions,
  customFieldDefinitions,
}: {
  requisitions: Requisition[];
  customFieldDefinitions: CustomFieldDefinition[];
}) {
  const { user } = useActor();

  // "Open" mirrors InterviewsView's openRequisitions exactly — still worth
  // shortlisting candidates against unless the req has expired.
  const openRequisitions = useMemo(() => requisitions.filter((r) => r.status !== "expired"), [requisitions]);

  const [requisitionId, setRequisitionId] = useState("");
  const requisition = requisitions.find((r) => r.id === requisitionId) ?? null;

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
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [reasonForChange, setReasonForChange] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValues>({});
  const [overrideTrack, setOverrideTrack] = useState(false);
  const [track, setTrack] = useState<"experienced" | "fresher_intern">("experienced");
  const [overrideReason, setOverrideReason] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<CandidateDuplicateMatch[] | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function selectRequisition(id: string) {
    setRequisitionId(id);
    const req = requisitions.find((r) => r.id === id);
    if (req) setTrack(req.position_type);
    setConfirmation(null);
  }

  function resetCandidateFields() {
    setName("");
    setPhone("");
    setEmail("");
    setNoticePeriod("");
    setCurrentCtc("");
    setExpectedCtc("");
    setCurrentLocation("");
    setSource("");
    setRelevantExperienceYears("");
    setNotes("");
    setLinkedinUrl("");
    setPortfolioUrl("");
    setReasonForChange("");
    setConsentGiven(false);
    setCustomFieldValues({});
    setOverrideTrack(false);
    setOverrideReason("");
    setResumeFile(null);
    setPhotoFile(null);
    setDuplicateMatches(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doSubmit(false);
  }

  async function doSubmit(confirmDuplicate: boolean) {
    if (!requisition) return;
    setError(null);
    setConfirmation(null);

    if (!name.trim()) {
      setError("Candidate name is required.");
      return;
    }
    if (overrideTrack && !overrideReason.trim()) {
      setError("A reason is required when overriding the candidate track.");
      return;
    }
    for (const def of customFieldDefinitions) {
      const v = customFieldValues[def.field_key];
      if (def.required && (v === undefined || v === null || v === "")) {
        setError(`"${def.label}" is required.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await api.createCandidate({
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
        linkedin_url: linkedinUrl || undefined,
        portfolio_url: portfolioUrl || undefined,
        reason_for_change: reasonForChange || undefined,
        consent_given: consentGiven,
        custom_fields: customFieldValues,
        confirm_duplicate: confirmDuplicate || undefined,
      });

      if ("duplicate" in result) {
        setDuplicateMatches(result.matches);
        return;
      }
      const candidate = result;
      const addedName = candidate.name;

      if (resumeFile) {
        try {
          await api.uploadResume(candidate.id, resumeFile);
        } catch (uploadErr) {
          setError(
            `${addedName} was added, but the resume upload failed: ${
              uploadErr instanceof Error ? uploadErr.message : "please retry from the candidate's detail panel."
            }`
          );
          resetCandidateFields();
          return;
        }
      }

      if (photoFile) {
        try {
          await api.uploadPhoto(candidate.id, photoFile);
        } catch (uploadErr) {
          setError(
            `${addedName} was added, but the photo upload failed: ${
              uploadErr instanceof Error ? uploadErr.message : "please retry from the candidate's detail panel."
            }`
          );
          resetCandidateFields();
          return;
        }
      }

      setConfirmation(`${addedName} added to Sourcing for ${requisition.req_code} — ${requisition.title}.`);
      resetCandidateFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setResumeFile(file);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setPhotoFile(file);
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Candidates</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Shortlist a new candidate against an open position.</p>
      </div>

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <Field label="Position *">
          <select className={inputClass} value={requisitionId} onChange={(e) => selectRequisition(e.target.value)}>
            <option value="">— Select a requisition —</option>
            {openRequisitions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.req_code} — {r.title}
              </option>
            ))}
          </select>
        </Field>

        {confirmation && (
          <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {confirmation}
          </div>
        )}

        {!requisition && <p className="text-xs text-slate-400 dark:text-slate-500">Select a position to shortlist a candidate.</p>}

        {requisition && (
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="LinkedIn URL">
                <input className={inputClass} placeholder="https://linkedin.com/in/…" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
              </Field>
              <Field label="Portfolio URL">
                <input className={inputClass} placeholder="https://…" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} />
              </Field>
            </div>
            <Field label="Reason for change">
              <textarea
                className={inputClass}
                rows={2}
                placeholder="Why the candidate is looking to move"
                value={reasonForChange}
                onChange={(e) => setReasonForChange(e.target.value)}
              />
            </Field>

            <CustomFieldsFields definitions={customFieldDefinitions} values={customFieldValues} onChange={setCustomFieldValues} />

            <label className="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} />
              Candidate has consented to their data being processed for this application
            </label>

            <Field label="Resume (PDF or Word)">
              {resumeFile ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-600">
                  <span className="truncate text-slate-700 dark:text-slate-300">{resumeFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setResumeFile(null)}
                    className="shrink-0 text-xs font-medium text-red-500 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                  + Attach resume
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeChange} />
                </label>
              )}
            </Field>

            <Field label="Candidate photo (JPG or PNG)">
              {photoFile ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-600">
                  <span className="truncate text-slate-700 dark:text-slate-300">{photoFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setPhotoFile(null)}
                    className="shrink-0 text-xs font-medium text-red-500 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                  + Attach photo
                  <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handlePhotoChange} />
                </label>
              )}
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

            {duplicateMatches && duplicateMatches.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <p className="mb-2 font-semibold">
                  A candidate with this {phone && email ? "phone/email" : phone ? "phone number" : "email"} already exists:
                </p>
                <ul className="mb-2 space-y-1.5">
                  {duplicateMatches.map((m) => (
                    <li key={m.candidate_code} className="rounded-md bg-white/60 px-2 py-1.5 dark:bg-black/20">
                      <span className="font-medium">{m.name}</span> ({m.candidate_code}) — shortlisted for{" "}
                      <span className="font-medium">{m.requisition_title ?? "an unknown requisition"}</span>
                      {m.req_code ? ` (${m.req_code})` : ""} on {formatDupeDate(m.shortlisted_on)}. {dupeStatusLine(m)}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => doSubmit(true)}
                    disabled={submitting}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Add anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateMatches(null)}
                    className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!duplicateMatches && (
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {submitting ? "Adding…" : "Add candidate"}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
