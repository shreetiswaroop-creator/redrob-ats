"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputClass } from "./Modal";
import { OrgSettings } from "@/lib/types";

export function OrgSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [hrManagementEmails, setHrManagementEmails] = useState("");
  const [commonHrMailboxName, setCommonHrMailboxName] = useState("");
  const [commonHrMailboxEmail, setCommonHrMailboxEmail] = useState("");
  const [hrmsTeamEmail, setHrmsTeamEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/org-settings")
      .then((r) => r.json())
      .then((data: OrgSettings) => {
        setSettings(data);
        setHrManagementEmails(data.hr_management_emails ?? "");
        setCommonHrMailboxName(data.common_hr_mailbox_name ?? "");
        setCommonHrMailboxEmail(data.common_hr_mailbox_email ?? "");
        setHrmsTeamEmail(data.hrms_team_email ?? "");
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
        body: JSON.stringify({
          hr_management_emails: hrManagementEmails,
          common_hr_mailbox_name: commonHrMailboxName,
          common_hr_mailbox_email: commonHrMailboxEmail,
          hrms_team_email: hrmsTeamEmail,
        }),
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

  return (
    <Modal title="Notification contacts" onClose={onClose}>
      {!settings ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <form onSubmit={handleSave}>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            These are org-wide contacts (not tied to a single requisition) used when logging what notifications
            would be sent — see Section 6 of the PRD.
          </p>
          <Field label="HR Management email(s)">
            <input
              className={inputClass}
              value={hrManagementEmails}
              onChange={(e) => { setSaved(false); setHrManagementEmails(e.target.value); }}
              placeholder="comma-separated if more than one"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Common HR Mailbox name">
              <input
                className={inputClass}
                value={commonHrMailboxName}
                onChange={(e) => { setSaved(false); setCommonHrMailboxName(e.target.value); }}
                placeholder="e.g. HR Team"
              />
            </Field>
            <Field label="Common HR Mailbox email">
              <input
                className={inputClass}
                value={commonHrMailboxEmail}
                onChange={(e) => { setSaved(false); setCommonHrMailboxEmail(e.target.value); }}
              />
            </Field>
          </div>
          <Field label="HRMS Team email">
            <input
              className={inputClass}
              value={hrmsTeamEmail}
              onChange={(e) => { setSaved(false); setHrmsTeamEmail(e.target.value); }}
            />
          </Field>

          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save contacts"}
          </button>
        </form>
      )}
    </Modal>
  );
}
