"use client";

import { useMemo, useRef, useState } from "react";
import { Field, inputClass, Modal } from "./Modal";
import { api } from "@/lib/api";
import {
  AppUser,
  Candidate,
  deriveInterviewRoundName,
  Interview,
  InterviewMode,
  InterviewRound,
  INTERVIEW_MODE_LABELS,
  Panelist,
  Requisition,
  STAGE_ORDER,
} from "@/lib/types";

type PanelistUser = Pick<AppUser, "id" | "name" | "email" | "role">;

// A panelist checkbox can point at either a `users` login account or a
// no-login `panelists` directory entry — this normalizes both into one
// list for display/selection, tagged with `source` so submission can split
// the selection back into the two separate id arrays the schema expects.
interface PanelistOption {
  key: string;
  id: string;
  source: "user" | "directory";
  name: string;
  email: string | null;
}

interface CandidateSearchOption {
  candidateId: string;
  requisitionId: string;
  label: string;
  searchText: string;
}

const INTERVIEW_MODE_OPTIONS: InterviewMode[] = ["video", "phone", "in_person"];

function combinedPanelistOptions(users: PanelistUser[], panelists: Panelist[]): PanelistOption[] {
  const fromUsers: PanelistOption[] = users.map((u) => ({
    key: `user:${u.id}`,
    id: u.id,
    source: "user",
    name: u.name,
    email: u.email,
  }));
  const fromPanelists: PanelistOption[] = panelists.map((p) => ({
    key: `panelist:${p.id}`,
    id: p.id,
    source: "directory",
    name: p.name,
    email: p.email,
  }));
  return [...fromUsers, ...fromPanelists].sort((a, b) => a.name.localeCompare(b.name));
}

const ROUND_NUMBERS = [1, 2, 3, 4, 5];

function sortBySoonest(interviews: Interview[]): Interview[] {
  return [...interviews].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

const DURATION_OPTIONS = [15, 30, 60];

// Fixed locale (not the runtime's default) so the server-rendered HTML and
// the client's post-hydration render always produce the same string —
// toLocaleString() with no locale argument otherwise formats using each
// environment's own locale, which caused a hydration mismatch here.
function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeStyle: "short" });
}

// e.g. "Aug 15, 2:30 PM – 3:00 PM" — start carries the full date, end is
// time-only since it's always the same day for a 15/30/60-minute interview.
function formatScheduledRange(startIso: string, durationMinutes: number): string {
  const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60 * 1000).toISOString();
  return `${formatScheduledAt(startIso)} – ${formatTimeOnly(endIso)}`;
}

// Upserts by round_name so re-scheduling the same round refreshes the
// existing entry instead of appending a duplicate. Existing manually-entered
// rounds (e.g. "L1", "Managerial") never collide with these fixed names, so
// they're left untouched either way.
function withSyncedRound(
  rounds: InterviewRound[],
  roundNumber: number,
  panelistEmails: string,
  scheduledAtIso: string,
  durationMinutes: number,
  mode: InterviewMode
): InterviewRound[] {
  const roundName = deriveInterviewRoundName(roundNumber);
  const existingIndex = rounds.findIndex((r) => r.round_name === roundName);
  const synced: InterviewRound = {
    round_name: roundName,
    outcome: "scheduled",
    notes: existingIndex >= 0 ? rounds[existingIndex].notes : undefined,
    panelist_emails: panelistEmails,
    scheduled_at: scheduledAtIso,
    duration_minutes: durationMinutes,
    mode,
  };
  if (existingIndex >= 0) {
    return rounds.map((r, i) => (i === existingIndex ? synced : r));
  }
  return [...rounds, synced];
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// Compares calendar day using LOCAL date components (not UTC) — scheduled_at
// is a UTC timestamp under the hood, and bucketing by UTC day would silently
// shift interviews near midnight onto the wrong day for anyone not in UTC.
function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayHeader(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatWeekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const startLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

const MODE_BADGE: Record<InterviewMode, string> = {
  video: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  phone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  in_person: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
};

const OUTCOME_BADGE: Record<InterviewRound["outcome"], string> = {
  scheduled: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
  cleared: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  rejected: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

const OUTCOME_LABEL: Record<InterviewRound["outcome"], string> = {
  scheduled: "Scheduled",
  cleared: "Cleared",
  rejected: "Rejected",
};

// The Interview row itself carries no outcome — the only status concept
// today lives on the candidate's matching interview_rounds entry (matched
// by round name, same technique used elsewhere in this file).
function findRoundOutcome(candidate: Candidate | undefined, roundNumber: number): InterviewRound["outcome"] | null {
  if (!candidate) return null;
  const roundName = deriveInterviewRoundName(roundNumber);
  return candidate.interview_rounds.find((r) => r.round_name === roundName)?.outcome ?? null;
}

export function InterviewsView({
  requisitions,
  candidates,
  users,
  initialPanelists,
  initialInterviews,
}: {
  requisitions: Requisition[];
  candidates: Candidate[];
  users: PanelistUser[];
  initialPanelists: Panelist[];
  initialInterviews: Interview[];
}) {
  const [candidatesState, setCandidatesState] = useState(candidates);
  const [panelistsState, setPanelistsState] = useState(initialPanelists);
  const [interviews, setInterviews] = useState(() => sortBySoonest(initialInterviews));

  const [requisitionId, setRequisitionId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [candidateSearchText, setCandidateSearchText] = useState("");
  const [roundNumber, setRoundNumber] = useState(1);
  const [mode, setMode] = useState<InterviewMode>("video");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [panelistSearchText, setPanelistSearchText] = useState("");
  const [panelistInputFocused, setPanelistInputFocused] = useState(false);
  const [confirmingNewPanelist, setConfirmingNewPanelist] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [meetingLink, setMeetingLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newPanelistName, setNewPanelistName] = useState("");
  const [newPanelistEmail, setNewPanelistEmail] = useState("");
  const [addingPanelist, setAddingPanelist] = useState(false);
  const [addPanelistError, setAddPanelistError] = useState<string | null>(null);
  const panelistInputRef = useRef<HTMLInputElement>(null);

  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [calendarPanelistFilter, setCalendarPanelistFilter] = useState("");
  const [detailInterview, setDetailInterview] = useState<Interview | null>(null);

  const panelistOptions = useMemo(
    () => combinedPanelistOptions(users, panelistsState.filter((p) => p.is_active)),
    [users, panelistsState]
  );

  // "Open" = still an active req worth interviewing for. Excludes Expired;
  // Fulfilled/On Hold reqs can still have in-flight candidates who need
  // interviews scheduled, so they stay selectable too.
  const openRequisitions = useMemo(
    () => requisitions.filter((r) => r.status !== "expired"),
    [requisitions]
  );

  // A candidate always belongs to exactly one requisition (Candidate.requisition_id
  // is a single required field, not a list) — so a single search that matches on
  // either the candidate or their requisition resolves both the candidate and the
  // requisition in one pick, rather than needing a separate "Position" dropdown
  // to narrow the "Candidate" dropdown first.
  const candidateSearchOptions = useMemo<CandidateSearchOption[]>(() => {
    const openReqIds = new Set(openRequisitions.map((r) => r.id));
    return candidatesState
      .filter((c) => c.status === "active" && openReqIds.has(c.requisition_id))
      .map((c) => {
        const requisition = requisitions.find((r) => r.id === c.requisition_id);
        const reqLabel = requisition ? `${requisition.req_code} — ${requisition.title}` : "Unknown position";
        return {
          candidateId: c.id,
          requisitionId: c.requisition_id,
          label: `${c.name} (${c.candidate_code}) · ${reqLabel}`,
          searchText: `${c.name} ${c.candidate_code} ${requisition?.req_code ?? ""} ${requisition?.title ?? ""}`.toLowerCase(),
        };
      });
  }, [candidatesState, requisitions, openRequisitions]);

  const filteredCandidateOptions = useMemo(() => {
    const q = candidateSearchText.trim().toLowerCase();
    if (!q) return [];
    return candidateSearchOptions.filter((o) => o.searchText.includes(q)).slice(0, 8);
  }, [candidateSearchOptions, candidateSearchText]);

  const selectedCandidateOption = useMemo(
    () => candidateSearchOptions.find((o) => o.candidateId === candidateId) ?? null,
    [candidateSearchOptions, candidateId]
  );

  const selectedPanelists = useMemo(
    () => panelistOptions.filter((o) => selectedKeys.includes(o.key)),
    [panelistOptions, selectedKeys]
  );

  // Most-recent scheduled_at each panelist was booked for, used to power the
  // "recently used" default list shown when the search box is empty.
  const panelistRecency = useMemo(() => {
    const map = new Map<string, number>();
    for (const iv of interviews) {
      const ts = new Date(iv.scheduled_at).getTime();
      for (const uid of iv.panelist_user_ids) {
        const key = `user:${uid}`;
        map.set(key, Math.max(map.get(key) ?? 0, ts));
      }
      for (const pid of iv.panelist_ids) {
        const key = `panelist:${pid}`;
        map.set(key, Math.max(map.get(key) ?? 0, ts));
      }
    }
    return map;
  }, [interviews]);

  const panelistSearchTrimmed = panelistSearchText.trim();

  const panelistDropdownOptions = useMemo(() => {
    const available = panelistOptions.filter((o) => !selectedKeys.includes(o.key));
    const q = panelistSearchTrimmed.toLowerCase();
    if (!q) {
      return available
        .filter((o) => panelistRecency.has(o.key))
        .sort((a, b) => (panelistRecency.get(b.key) ?? 0) - (panelistRecency.get(a.key) ?? 0))
        .slice(0, 5);
    }
    return available
      .filter((o) => o.name.toLowerCase().includes(q) || (o.email ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [panelistOptions, selectedKeys, panelistSearchTrimmed, panelistRecency]);

  const calendarFilteredInterviews = useMemo(() => {
    if (!calendarPanelistFilter) return interviews;
    const [source, id] = calendarPanelistFilter.split(":");
    return interviews.filter((iv) =>
      source === "user" ? iv.panelist_user_ids.includes(id) : iv.panelist_ids.includes(id)
    );
  }, [interviews, calendarPanelistFilter]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const interviewsByDay = useMemo(
    () =>
      weekDays.map((day) =>
        calendarFilteredInterviews
          .filter((iv) => isSameLocalDay(new Date(iv.scheduled_at), day))
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      ),
    [weekDays, calendarFilteredInterviews]
  );

  const today = new Date();

  function resetForm() {
    setRequisitionId("");
    setCandidateId("");
    setCandidateSearchText("");
    setRoundNumber(1);
    setMode("video");
    setSelectedKeys([]);
    setPanelistSearchText("");
    setConfirmingNewPanelist(false);
    setDate("");
    setTime("");
    setDurationMinutes(30);
    setMeetingLink("");
  }

  function selectCandidateOption(option: CandidateSearchOption) {
    setRequisitionId(option.requisitionId);
    setCandidateId(option.candidateId);
    setCandidateSearchText("");
  }

  function selectPanelist(key: string) {
    setSelectedKeys((keys) => [...keys, key]);
    setPanelistSearchText("");
    panelistInputRef.current?.focus();
  }

  function removeSelectedPanelist(key: string) {
    setSelectedKeys((keys) => keys.filter((k) => k !== key));
  }

  function startAddNewPanelist() {
    setNewPanelistName(panelistSearchTrimmed);
    setNewPanelistEmail("");
    setAddPanelistError(null);
    setConfirmingNewPanelist(true);
  }

  function cancelAddNewPanelist() {
    setConfirmingNewPanelist(false);
    setNewPanelistName("");
    setNewPanelistEmail("");
    setAddPanelistError(null);
  }

  async function handleAddPanelist(e?: React.FormEvent) {
    e?.preventDefault();
    if (!newPanelistName.trim()) return;
    setAddPanelistError(null);
    setAddingPanelist(true);
    try {
      const created = await api.createPanelist({
        name: newPanelistName.trim(),
        email: newPanelistEmail.trim() || undefined,
      });
      setPanelistsState((prev) => [...prev, created]);
      setSelectedKeys((keys) => [...keys, `panelist:${created.id}`]);
      setNewPanelistName("");
      setNewPanelistEmail("");
      setConfirmingNewPanelist(false);
      setPanelistSearchText("");
      panelistInputRef.current?.focus();
    } catch (err) {
      setAddPanelistError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAddingPanelist(false);
    }
  }

  // Archives the panelist (see the API route) rather than deleting it, so
  // past interviews that already had them still resolve their name — they
  // just stop showing up as an option for new ones. Only directory entries
  // can be removed this way; `users` are ATS login accounts managed on the
  // Accounts page.
  async function handleRemovePanelist(id: string) {
    setAddPanelistError(null);
    try {
      const updated = await api.deletePanelist(id);
      setPanelistsState((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setSelectedKeys((keys) => keys.filter((k) => k !== `panelist:${id}`));
    } catch (err) {
      setAddPanelistError(err instanceof Error ? err.message : "Failed to remove panelist.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!requisitionId || !candidateId || !date || !time) {
      setError("Candidate/position, date, and time are all required.");
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError("That date/time couldn't be parsed — please re-check it.");
      return;
    }
    const scheduledAtIso = scheduledAt.toISOString();

    const selectedOptions = panelistOptions.filter((o) => selectedKeys.includes(o.key));
    const panelistUserIds = selectedOptions.filter((o) => o.source === "user").map((o) => o.id);
    const panelistIds = selectedOptions.filter((o) => o.source === "directory").map((o) => o.id);

    setSubmitting(true);
    try {
      const interview = await api.createInterview({
        requisition_id: requisitionId,
        candidate_id: candidateId,
        round_number: roundNumber,
        panelist_user_ids: panelistUserIds,
        panelist_ids: panelistIds,
        scheduled_at: scheduledAtIso,
        duration_minutes: durationMinutes,
        mode,
        meeting_link: meetingLink.trim() || undefined,
      });
      setInterviews((prev) => sortBySoonest([...prev, interview]));

      const candidate = candidatesState.find((c) => c.id === candidateId);
      if (candidate) {
        const panelistEmails = selectedOptions
          .map((o) => o.email)
          .filter((email): email is string => !!email)
          .join(", ");
        const updatedRounds = withSyncedRound(candidate.interview_rounds, roundNumber, panelistEmails, scheduledAtIso, durationMinutes, mode);
        try {
          // Scheduling an interview should be the thing that moves a
          // candidate off Sourcing/Screening onto the board's Interview
          // Round(s) column — not a separate manual drag afterward, which
          // just meant the "moved to interview" email fired at a confusing,
          // disconnected moment. Only advances forward; a 2nd/3rd round
          // scheduled while already at Interview (or later) leaves the
          // stage untouched.
          let working = candidate;
          if (STAGE_ORDER.indexOf(candidate.current_stage) < STAGE_ORDER.indexOf("interview")) {
            working = await api.moveCandidateStage(candidate.id, "interview");
          }
          const updatedCandidate = await api.updateCandidateFields(working.id, { interview_rounds: updatedRounds });
          setCandidatesState((prev) => prev.map((c) => (c.id === updatedCandidate.id ? updatedCandidate : c)));
        } catch (syncErr) {
          setError(
            `Interview scheduled, but syncing it to ${candidate.name}'s card failed: ${
              syncErr instanceof Error ? syncErr.message : "please check the candidate's Interview round tags."
            }`
          );
          setSubmitting(false);
          return;
        }
      }

      resetForm();
      setSchedulerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const schedulerForm = (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <div>
            <Field label="Candidate & position *">
              {selectedCandidateOption ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-300">
                  <span className="truncate">{selectedCandidateOption.label}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRequisitionId("");
                      setCandidateId("");
                      setCandidateSearchText("");
                    }}
                    className="shrink-0 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className={inputClass}
                    placeholder="Search by candidate name or position…"
                    value={candidateSearchText}
                    onChange={(e) => setCandidateSearchText(e.target.value)}
                  />
                  {candidateSearchText.trim() && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
                      {filteredCandidateOptions.length === 0 && (
                        <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">No matching candidates.</p>
                      )}
                      {filteredCandidateOptions.map((o) => (
                        <button
                          key={o.candidateId}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectCandidateOption(o)}
                          className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Field>

            <Field label="Interview round *">
              <select
                className={inputClass}
                value={roundNumber}
                onChange={(e) => setRoundNumber(Number(e.target.value))}
              >
                {ROUND_NUMBERS.map((n) => (
                  <option key={n} value={n}>
                    {deriveInterviewRoundName(n)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Mode *">
              <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as InterviewMode)}>
                {INTERVIEW_MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {INTERVIEW_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <Field label="Panelist(s) *">
              <div className="flex flex-wrap gap-1.5 empty:hidden">
                {selectedPanelists.map((o) => (
                  <span
                    key={o.key}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    {o.name}
                    <button
                      type="button"
                      onClick={() => removeSelectedPanelist(o.key)}
                      className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
                      aria-label={`Remove ${o.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="relative mt-1.5">
                <input
                  ref={panelistInputRef}
                  className={inputClass}
                  placeholder="Search panelists by name or email…"
                  value={panelistSearchText}
                  onChange={(e) => setPanelistSearchText(e.target.value)}
                  onFocus={() => setPanelistInputFocused(true)}
                  onBlur={() => setPanelistInputFocused(false)}
                  disabled={confirmingNewPanelist}
                />

                {!confirmingNewPanelist && panelistInputFocused && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
                    {!panelistSearchTrimmed && (
                      <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Recently used
                      </p>
                    )}
                    {panelistDropdownOptions.length === 0 && !panelistSearchTrimmed && (
                      <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Type to search all panelists.</p>
                    )}
                    {panelistDropdownOptions.map((o) => (
                      <div key={o.key} className="flex items-center gap-1 px-1">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectPanelist(o.key)}
                          className="flex-1 truncate px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          {o.name} {o.email ? <span className="text-slate-400 dark:text-slate-500">({o.email})</span> : null}
                        </button>
                        {o.source === "directory" && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleRemovePanelist(o.id)}
                            title="Remove this panelist (e.g. they left the company) — won't affect past interviews"
                            className="shrink-0 px-1 text-xs text-red-500 hover:underline dark:text-red-400"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {panelistSearchTrimmed && panelistDropdownOptions.length === 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={startAddNewPanelist}
                        className="block w-full px-3 py-2 text-left text-sm text-indigo-600 hover:bg-slate-50 dark:text-indigo-400 dark:hover:bg-slate-700"
                      >
                        + Add &ldquo;{panelistSearchTrimmed}&rdquo; as a new panelist
                      </button>
                    )}
                  </div>
                )}
              </div>

              {confirmingNewPanelist && (
                <div className="mt-1.5 rounded-lg border border-slate-300 p-2 dark:border-slate-600">
                  <p className="mb-1.5 text-xs text-slate-600 dark:text-slate-400">
                    Add &ldquo;{newPanelistName}&rdquo; as a new panelist
                  </p>
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                    <input
                      className={inputClass}
                      placeholder="Email (optional)"
                      value={newPanelistEmail}
                      onChange={(e) => setNewPanelistEmail(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddPanelist}
                      disabled={addingPanelist}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {addingPanelist ? "Adding…" : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelAddNewPanelist}
                      className="text-xs text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {addPanelistError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{addPanelistError}</p>}
            </Field>

            <Field label="Date and time *">
              <div className="grid grid-cols-2 gap-3">
                <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </Field>

            <Field label="Duration *">
              <select
                className={inputClass}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Meet link (optional)">
              <input
                type="url"
                className={inputClass}
                placeholder="https://meet.google.com/..."
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
              />
            </Field>

            {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {submitting ? "Adding…" : "Add interview"}
            </button>
          </div>
        </div>
    </form>
  );

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Interviews</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Schedule interviews and keep them in sync with each candidate&apos;s card.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSchedulerOpen(true)}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          + Schedule an interview
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            aria-label="Previous week"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            aria-label="Next week"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ▶
          </button>
          <span className="ml-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            {formatWeekRangeLabel(weekStart)}
          </span>
        </div>

        <select
          className={`${inputClass} w-auto`}
          value={calendarPanelistFilter}
          onChange={(e) => setCalendarPanelistFilter(e.target.value)}
        >
          <option value="">Filter by panelist: All</option>
          {panelistOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {weekDays.map((day, i) => {
            const isToday = isSameLocalDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`rounded-xl border bg-white p-2 dark:bg-slate-800 ${
                  isToday ? "border-indigo-400 dark:border-indigo-500" : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <div
                  className={`mb-2 text-xs font-semibold ${
                    isToday ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {formatDayHeader(day)}
                </div>
                <div className="flex max-h-[520px] flex-col gap-1.5 overflow-y-auto">
                  {interviewsByDay[i].length === 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">No interviews</p>
                  )}
                  {interviewsByDay[i].map((iv) => {
                    const requisition = requisitions.find((r) => r.id === iv.requisition_id);
                    const candidate = candidatesState.find((c) => c.id === iv.candidate_id);
                    const outcome = findRoundOutcome(candidate, iv.round_number);
                    return (
                      <button
                        key={iv.id}
                        type="button"
                        onClick={() => setDetailInterview(iv)}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-left text-xs hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:hover:bg-slate-700"
                      >
                        <div className="font-medium text-slate-800 dark:text-slate-200">{formatTimeOnly(iv.scheduled_at)}</div>
                        <div className="truncate text-slate-700 dark:text-slate-300">{candidate?.name ?? "—"}</div>
                        <div className="truncate text-slate-500 dark:text-slate-400">
                          {requisition ? requisition.req_code : "—"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${MODE_BADGE[iv.mode]}`}>
                            {INTERVIEW_MODE_LABELS[iv.mode]}
                          </span>
                          {outcome && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${OUTCOME_BADGE[outcome]}`}>
                              {OUTCOME_LABEL[outcome]}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {schedulerOpen && (
        <Modal title="Schedule an interview" onClose={() => setSchedulerOpen(false)} wide>
          {schedulerForm}
        </Modal>
      )}

      {detailInterview &&
        (() => {
          const iv = detailInterview;
          const requisition = requisitions.find((r) => r.id === iv.requisition_id);
          const candidate = candidatesState.find((c) => c.id === iv.candidate_id);
          const outcome = findRoundOutcome(candidate, iv.round_number);
          const userNames = iv.panelist_user_ids
            .map((id) => users.find((u) => u.id === id)?.name)
            .filter((name): name is string => !!name);
          const directoryNames = iv.panelist_ids
            .map((id) => panelistsState.find((p) => p.id === id)?.name)
            .filter((name): name is string => !!name);
          const panelistNames = [...userNames, ...directoryNames].join(", ");
          return (
            <Modal title="Interview details" onClose={() => setDetailInterview(null)}>
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <div>
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Position</span>
                  {requisition ? `${requisition.req_code} — ${requisition.title}` : "—"}
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Candidate</span>
                  {candidate ? `${candidate.name} (${candidate.candidate_code})` : "—"}
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Round</span>
                  {deriveInterviewRoundName(iv.round_number)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MODE_BADGE[iv.mode]}`}>
                    {INTERVIEW_MODE_LABELS[iv.mode]}
                  </span>
                  {outcome && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_BADGE[outcome]}`}>
                      {OUTCOME_LABEL[outcome]}
                    </span>
                  )}
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Panelists</span>
                  {panelistNames || "—"}
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Date &amp; time</span>
                  {formatScheduledRange(iv.scheduled_at, iv.duration_minutes)}
                </div>
              </div>
            </Modal>
          );
        })()}
    </div>
  );
}
