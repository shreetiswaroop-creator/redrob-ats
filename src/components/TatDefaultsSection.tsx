"use client";

import { useEffect, useState } from "react";
import { Field, inputClass } from "./Modal";
import { OrgSettings } from "@/lib/types";

export function TatDefaultsSection() {
  const [loaded, setLoaded] = useState(false);
  const [tatHours, setTatHours] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/org-settings")
      .then((r) => r.json())
      .then((data: OrgSettings) => {
        setTatHours(data.default_step_tat_hours ?? 24);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings."));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/org-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_step_tat_hours: tatHours }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong.");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;

  return (
    <form onSubmit={handleSave} className="max-w-sm">
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Default TAT (turnaround time) applied to each of the 5 offer steps for newly-added candidates — Pre-Offer,
        Reference Check, Offer Letter, HR BGV, Employee Agreement. Doesn&apos;t affect steps already in progress.
      </p>
      <Field label="Default step TAT (hours)">
        <input
          type="number"
          min={1}
          className={inputClass}
          value={tatHours}
          onChange={(e) => { setSaved(false); setTatHours(Number(e.target.value)); }}
        />
      </Field>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save default"}
      </button>
    </form>
  );
}
