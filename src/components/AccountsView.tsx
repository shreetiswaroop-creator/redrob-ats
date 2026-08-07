"use client";

import { useState } from "react";
import { AppUser, UserRole } from "@/lib/types";
import { Field, inputClass } from "./Modal";

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [demoCount, setDemoCount] = useState(initialDemoCount);
  const [demoBusy, setDemoBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

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
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setUsers((u) => [...u, body]);
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

  async function handleRemove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setUsers((u) => u.filter((x) => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
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
        <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Work email">
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
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
          <Field label="Role">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="recruiter">Recruiter</option>
              <option value="hr_management">HR Management</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={submitting}
            className="col-span-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? "Adding…" : "Add account"}
          </button>
        </form>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Share the temporary password with them directly — there's no email invite yet. They can change it after
          logging in.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
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
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 text-slate-700 dark:border-slate-700 dark:text-slate-300">
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {u.role === "hr_management" ? "HR Management" : "Recruiter"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
                  {u.created_by ? ` by ${u.created_by}` : ""}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id !== currentUserId && (
                    <button onClick={() => handleRemove(u.id)} className="text-xs text-red-500 hover:underline dark:text-red-400">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
