"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HiringManagerCandidate } from "@/lib/types";
import { api } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { RedrobLogo } from "./RedrobLogo";
import { RejectModal } from "./RejectModal";

export function HiringManagerReviewView({ userName }: { userName: string }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<HiringManagerCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<HiringManagerCandidate | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    api
      .listHiringManagerCandidates()
      .then(setCandidates)
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."));
  }, []);

  async function handlePass(candidate: HiringManagerCandidate) {
    setError(null);
    setActingOnId(candidate.id);
    try {
      await api.moveCandidateStage(candidate.id, "interview");
      setCandidates((prev) => (prev ?? []).filter((c) => c.id !== candidate.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOnId(null);
    }
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    await api.rejectCandidate(rejectTarget.id, reason);
    setCandidates((prev) => (prev ?? []).filter((c) => c.id !== rejectTarget.id));
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
        <RedrobLogo size="lg" />
        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span>{userName}</span>
          <ThemeToggle />
          <button onClick={handleLogout} disabled={loggingOut} className="underline hover:text-slate-700 dark:hover:text-slate-200">
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Candidates to review</h1>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Everyone currently in Screening for your requisition(s). Pass moves them to Interview Round(s); Reject
          removes them from consideration.
        </p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900 dark:text-red-300">
            {error}{" "}
            <button className="underline" onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
        )}

        {candidates === null && <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>}

        {candidates !== null && candidates.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">No candidates waiting on your review right now.</p>
        )}

        <div className="space-y-3">
          {candidates?.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {c.requisition.title} <span className="font-mono">{c.requisition.req_code}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handlePass(c)}
                    disabled={actingOnId === c.id}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    {actingOnId === c.id ? "…" : "Pass"}
                  </button>
                  <button
                    onClick={() => setRejectTarget(c)}
                    disabled={actingOnId === c.id}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Reject
                  </button>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">Resume</dt>
                  <dd>
                    {c.resume_filename ? (
                      <a
                        href={`/api/candidates/${c.id}/resume`}
                        className="text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        {c.resume_filename}
                      </a>
                    ) : (
                      "Not on file"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">Relevant experience</dt>
                  <dd>{c.relevant_experience_years !== null ? `${c.relevant_experience_years} years` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">LinkedIn</dt>
                  <dd>
                    {c.linkedin_url ? (
                      <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300">
                        Profile
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">Portfolio</dt>
                  <dd>
                    {c.portfolio_url ? (
                      <a href={c.portfolio_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300">
                        Link
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-400 dark:text-slate-500">Reason for change</dt>
                  <dd>{c.reason_for_change || "—"}</dd>
                </div>
              </dl>

              {c.candidate_notes.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-700">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Notes</p>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {c.candidate_notes.map((n, i) => (
                      <li key={i}>
                        <span className="text-slate-400 dark:text-slate-500">{new Date(n.created_at).toLocaleDateString()} · {n.author}:</span>{" "}
                        {n.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {rejectTarget && (
        <RejectModal candidateName={rejectTarget.name} onClose={() => setRejectTarget(null)} onConfirm={handleRejectConfirm} />
      )}
    </div>
  );
}
