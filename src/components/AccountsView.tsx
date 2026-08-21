"use client";

import { useEffect, useState } from "react";
import { AppUser, USER_ROLE_LABELS, UserRole } from "@/lib/types";
import { Field, inputClass, Modal } from "./Modal";

interface OwnedCandidatePreview {
  id: string;
  candidate_code: string;
  name: string;
  requisition_id: string;
  requisition: { req_code: string; title: string } | null;
}

// Shown when deactivating someone who still owns active candidates — a
// single bulk "reassign all to" default, with an optional per-candidate
// override list, so HR Management can split a caseload across two people
// without that being the common case's extra click.
function DeactivateFlow({
  target,
  otherActiveUsers,
  onClose,
  onDeactivated,
}: {
  target: AppUser;
  otherActiveUsers: AppUser[];
  onClose: () => void;
  onDeactivated: (id: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<OwnedCandidatePreview[] | null>(null);

  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showList, setShowList] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${target.id}/active-candidates`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setCandidates(body.candidates);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, [target.id]);

  function handleBulkChange(id: string) {
    setBulkOwnerId(id);
    setOverrides({}); // a new bulk default replaces any earlier one-off picks
  }

  async function handleConfirm() {
    setSubmitError(null);
    setBusy(true);
    try {
      const reassignments = (candidates ?? []).map((c) => ({
        candidateId: c.id,
        newOwnerId: overrides[c.id] ?? bulkOwnerId,
      }));
      const res = await fetch(`/api/users/${target.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reassignments }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      onDeactivated(target.id);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const requisitionCount = candidates ? new Set(candidates.map((c) => c.requisition_id)).size : 0;
  const needsReassignment = (candidates?.length ?? 0) > 0;

  return (
    <Modal title={`Deactivate ${target.name}`} onClose={onClose} wide={needsReassignment}>
      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Checking their active candidates…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : !needsReassignment ? (
        <div>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            {target.name} doesn&apos;t own any active candidates. They&apos;ll no longer be able to log in — their name
            stays intact on past audit log entries and notifications.
          </p>
          {submitError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{submitError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Deactivating…" : "Confirm & Deactivate"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            <strong>{target.name}</strong> owns <strong>{candidates!.length}</strong> active candidate
            {candidates!.length === 1 ? "" : "s"} across <strong>{requisitionCount}</strong> requisition
            {requisitionCount === 1 ? "" : "s"}.
          </p>

          <Field label="Reassign all to:">
            <select className={inputClass} value={bulkOwnerId} onChange={(e) => handleBulkChange(e.target.value)}>
              <option value="">Choose a recruiter…</option>
              {otherActiveUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>

          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            className="mb-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {showList ? "Hide" : "Show"} individual candidates
          </button>

          {showList && (
            <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Candidate</th>
                    <th className="px-3 py-2">Requisition</th>
                    <th className="px-3 py-2">Reassign to</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates!.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {c.name} ({c.candidate_code})
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                        {c.requisition ? `${c.requisition.req_code} — ${c.requisition.title}` : "Unknown"}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className={`${inputClass} py-1 text-xs`}
                          value={overrides[c.id] ?? bulkOwnerId}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        >
                          <option value="">Choose a recruiter…</option>
                          {otherActiveUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {submitError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{submitError}</p>}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy || !bulkOwnerId || candidates!.some((c) => !(overrides[c.id] ?? bulkOwnerId))}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Deactivating…" : "Confirm & Deactivate"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function AccountsView({
  initialUsers,
  currentUserId,
  initialDemoCount,
}: {
  initialUsers: AppUser[];
  currentUserId: string;
  initialDemoCount: number;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("recruiter");
  const [addMode, setAddMode] = useState<"password" | "invite">("password");
  const [liveSendingEnabled, setLiveSendingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // AccountsView only ever renders for hr_management (page + API both gate
  // on it), so this read is safe without a second role check here.
  useEffect(() => {
    fetch("/api/org-settings")
      .then((r) => r.json())
      .then((data) => setLiveSendingEnabled(!!data.live_sending_enabled))
      .catch(() => {});
  }, []);

  const [demoCount, setDemoCount] = useState(initialDemoCount);
  const [demoBusy, setDemoBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const [deactivatingUser, setDeactivatingUser] = useState<AppUser | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);

  const activeUsers = users.filter((u) => !u.deactivated_at);
  const deactivatedUsers = users.filter((u) => u.deactivated_at);

  async function handleSeedDemo() {
    setDemoError(null);
    setDemoBusy(true);
    try {
      const res = await fetch("/api/demo/seed", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setDemoCount((n) => n + body.candidatesCreated + body.requisitionsCreated);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleClearDemo() {
    setDemoError(null);
    setDemoBusy(true);
    try {
      const res = await fetch("/api/demo/clear", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setDemoCount(0);
      setConfirmingClear(false);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAddedMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addMode === "invite" ? { name, email, role, invite: true } : { name, email, role, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setUsers((u) => [...u, body]);
      if (addMode === "invite") {
        setAddedMessage(
          body.invite_sent
            ? `Invite sent to ${body.email} — they'll set their own password.`
            : `Account created, but the invite email failed to send. They can request a reset themselves from the login page's "Forgot password?" link, or switch to sharing a temporary password directly.`
        );
      }
      setName("");
      setEmail("");
      setPassword("");
      setRole("recruiter");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeactivated(id: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, deactivated_at: new Date().toISOString() } : u)));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Accounts</h1>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900 dark:text-red-300">{error}</div>}

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Demo data</h2>
        {demoError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{demoError}</p>}
        {demoCount > 0 ? (
          <>
            <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ {demoCount} demo record{demoCount === 1 ? "" : "s"} in the system (requisitions + candidates, all
              prefixed &ldquo;[DEMO]&rdquo;). Clear these before real recruiters start using the board.
            </p>
            {confirmingClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400">Permanently delete all demo data?</span>
                <button
                  onClick={handleClearDemo}
                  disabled={demoBusy}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {demoBusy ? "Clearing…" : "Yes, clear it"}
                </button>
                <button
                  onClick={() => setConfirmingClear(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingClear(true)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                Clear all demo data
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              Seed ~13 sample candidates across the pipeline (mixed stages, tracks, and sources) so the board and
              dashboard look realistic while testing. All seeded records are clearly tagged and safe to bulk-remove
              later from here.
            </p>
            <button
              onClick={handleSeedDemo}
              disabled={demoBusy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {demoBusy ? "Seeding…" : "Seed demo data"}
            </button>
          </>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Add an account</h2>

        {addedMessage && (
          <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
            {addedMessage}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={addMode === "password"} onChange={() => setAddMode("password")} />
            Set a temporary password
          </label>
          <label className={`flex items-center gap-1.5 ${liveSendingEnabled ? "" : "opacity-50"}`}>
            <input
              type="radio"
              checked={addMode === "invite"}
              onChange={() => setAddMode("invite")}
              disabled={!liveSendingEnabled}
            />
            Send email invite
          </label>
        </div>
        {!liveSendingEnabled && (
          <p className="mb-3 text-[11px] text-slate-400 dark:text-slate-500">
            Turn on &ldquo;Actually send emails &amp; calendar invites&rdquo; under Settings → Org Contacts to enable
            email invites.
          </p>
        )}

        <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Work email">
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {addMode === "password" && (
            <Field label="Temporary password (8+ characters)">
              <input
                type="text"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </Field>
          )}
          <Field label="Role">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="recruiter">Recruiter</option>
              <option value="hr_management">HR Management</option>
              <option value="hiring_manager">Hiring Manager</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={submitting}
            className="col-span-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? "Adding…" : addMode === "invite" ? "Add account & send invite" : "Add account"}
          </button>
        </form>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          {addMode === "invite"
            ? "They'll get an email with a link to set their own password — nothing to share with them directly."
            : "Share the temporary password with them directly. They can change it after logging in."}
        </p>
      </div>

      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Added</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {activeUsers.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 text-slate-700 dark:border-slate-700 dark:text-slate-300">
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {USER_ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
                  {u.created_by ? ` by ${u.created_by}` : ""}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id !== currentUserId && (
                    <button onClick={() => setDeactivatingUser(u)} className="text-xs text-red-500 hover:underline dark:text-red-400">
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deactivatedUsers.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setShowDeactivated((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Deactivated ({deactivatedUsers.length})
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">{showDeactivated ? "Hide" : "Show"}</span>
          </button>
          {showDeactivated && (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Deactivated</th>
                </tr>
              </thead>
              <tbody>
                {deactivatedUsers.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 text-slate-400 dark:border-slate-700 dark:text-slate-500">
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        {USER_ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{new Date(u.deactivated_at as string).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {deactivatingUser && (
        <DeactivateFlow
          target={deactivatingUser}
          otherActiveUsers={activeUsers.filter((u) => u.id !== deactivatingUser.id)}
          onClose={() => setDeactivatingUser(null)}
          onDeactivated={handleDeactivated}
        />
      )}
    </div>
  );
}
