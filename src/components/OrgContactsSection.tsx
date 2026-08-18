"use client";

import { useEffect, useState } from "react";
import { Field, inputClass } from "./Modal";
import { OrgSettings } from "@/lib/types";

export function OrgContactsSection() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [hrManagementEmails, setHrManagementEmails] = useState("");
  const [commonHrMailboxName, setCommonHrMailboxName] = useState("");
  const [commonHrMailboxEmail, setCommonHrMailboxEmail] = useState("");
  const [hrmsTeamEmail, setHrmsTeamEmail] = useState("");
  const [liveSendingEnabled, setLiveSendingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [disconnectingCommon, setDisconnectingCommon] = useState(false);

  useEffect(() => {
    fetch("/api/org-settings")
      .then((r) => r.json())
      .then((data: OrgSettings) => {
        setSettings(data);
        setHrManagementEmails(data.hr_management_emails ?? "");
        setCommonHrMailboxName(data.common_hr_mailbox_name ?? "");
        setCommonHrMailboxEmail(data.common_hr_mailbox_email ?? "");
        setHrmsTeamEmail(data.hrms_team_email ?? "");
        setLiveSendingEnabled(data.live_sending_enabled ?? false);
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
          live_sending_enabled: liveSendingEnabled,
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

  async function handleDisconnectCommonMailbox() {
    setDisconnectingCommon(true);
    try {
      await fetch("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "common" }),
      });
      setSettings((s) => (s ? { ...s, common_hr_gmail_connected_at: null } : s));
    } finally {
      setDisconnectingCommon(false);
    }
  }

  if (!settings) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;

  return (
    <form onSubmit={handleSave} className="max-w-lg">
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Org-wide contacts (not tied to a single requisition) used when logging — or, once connected and turned on
        below, actually sending — notifications.
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

      <div className="mb-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">Common HR Mailbox — Gmail &amp; Calendar</p>
        {settings.common_hr_gmail_connected_at ? (
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-600 dark:text-emerald-400" title={settings.common_hr_mailbox_email ?? undefined}>
              ✓ Connected
            </span>
            <button
              type="button"
              onClick={handleDisconnectCommonMailbox}
              disabled={disconnectingCommon}
              className="text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {disconnectingCommon ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/google/connect?target=common"
            className="text-xs font-medium text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
          >
            Connect this mailbox&apos;s Gmail &amp; Calendar
          </a>
        )}
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Sign in as the Common HR Mailbox email above when prompted — this lets it send/receive calendar invites like any other connected account.
        </p>
      </div>

      <label className="mb-3 flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={liveSendingEnabled}
          onChange={(e) => { setSaved(false); setLiveSendingEnabled(e.target.checked); }}
        />
        <span>
          <span className="font-medium">Actually send emails &amp; calendar invites</span> via connected Gmail
          accounts, instead of only logging them. Turn this on once you&apos;ve tested the connect flow — it can
          be switched back off any time.
        </span>
      </label>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save contacts"}
      </button>
    </form>
  );
}
