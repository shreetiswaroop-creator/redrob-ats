"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "./Modal";
import { api } from "@/lib/api";
import { EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_MERGE_FIELDS, EmailTemplate, EmailTemplateKey } from "@/lib/types";

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function EmailTemplatesView({ initialTemplates }: { initialTemplates: EmailTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const orderedTemplates = useMemo(
    () =>
      EMAIL_TEMPLATE_KEYS.map((key) => templates.find((t) => t.template_key === key)).filter(
        (t): t is EmailTemplate => !!t
      ),
    [templates]
  );

  const [selectedKey, setSelectedKey] = useState<EmailTemplateKey | null>(orderedTemplates[0]?.template_key as EmailTemplateKey ?? null);
  const selected = templates.find((t) => t.template_key === selectedKey) ?? null;

  const [subject, setSubject] = useState(selected?.subject_template ?? "");
  const [bodyText, setBodyText] = useState(selected?.body_template ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectTemplate(t: EmailTemplate) {
    setSelectedKey(t.template_key as EmailTemplateKey);
    setSubject(t.subject_template);
    setBodyText(t.body_template);
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await api.updateEmailTemplate(selected.template_key, {
        subject_template: subject,
        body_template: bodyText,
      });
      setTemplates((prev) => prev.map((t) => (t.template_key === updated.template_key ? updated : t)));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const mergeFields = selectedKey ? EMAIL_TEMPLATE_MERGE_FIELDS[selectedKey] : [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Email Templates</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The wording sent for each of these events — edits apply the moment Gmail sending is connected.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {orderedTemplates.map((t) => (
            <button
              key={t.template_key}
              type="button"
              onClick={() => selectTemplate(t)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                t.template_key === selectedKey
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {selected && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{selected.label}</h2>
            <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
              {selected.updated_by
                ? `Last edited by ${selected.updated_by} on ${formatUpdatedAt(selected.updated_at)}`
                : "Not yet edited — showing the default wording."}
            </p>

            <Field label="Merge fields available for this template">
              <div className="flex flex-wrap gap-1.5">
                {mergeFields.map((f) => (
                  <code
                    key={f}
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  >
                    {`{{${f}}}`}
                  </code>
                ))}
              </div>
            </Field>

            <Field label="Subject">
              <input className={inputClass} value={subject} onChange={(e) => { setSubject(e.target.value); setSaved(false); }} />
            </Field>

            <Field label="Body">
              <textarea
                className={inputClass}
                rows={8}
                value={bodyText}
                onChange={(e) => { setBodyText(e.target.value); setSaved(false); }}
              />
            </Field>

            {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
