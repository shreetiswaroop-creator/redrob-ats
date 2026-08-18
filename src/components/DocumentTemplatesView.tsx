"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "./Modal";
import { api } from "@/lib/api";
import {
  DOCUMENT_TEMPLATE_KEYS,
  DOCUMENT_TEMPLATE_MERGE_FIELDS,
  DocumentSectionQuestion,
  DocumentTemplate,
  DocumentTemplateKey,
} from "@/lib/types";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function DocumentTemplatesView({ initialTemplates }: { initialTemplates: DocumentTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const orderedTemplates = useMemo(
    () => DOCUMENT_TEMPLATE_KEYS.map((key) => templates.find((t) => t.template_key === key)).filter((t): t is DocumentTemplate => !!t),
    [templates]
  );

  const [selectedKey, setSelectedKey] = useState<DocumentTemplateKey | null>(
    (orderedTemplates[0]?.template_key as DocumentTemplateKey) ?? null
  );
  const selected = templates.find((t) => t.template_key === selectedKey) ?? null;

  const [sectionAIntro, setSectionAIntro] = useState(selected?.section_a_intro ?? "");
  const [questions, setQuestions] = useState<DocumentSectionQuestion[]>(selected?.section_a_questions ?? []);
  const [sectionBText, setSectionBText] = useState(selected?.section_b_text ?? "");
  const [sectionCNote, setSectionCNote] = useState(selected?.section_c_note ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectTemplate(t: DocumentTemplate) {
    setSelectedKey(t.template_key as DocumentTemplateKey);
    setSectionAIntro(t.section_a_intro);
    setQuestions(t.section_a_questions);
    setSectionBText(t.section_b_text);
    setSectionCNote(t.section_c_note);
    setSaved(false);
    setError(null);
  }

  function updateQuestion(i: number, prompt_template: string) {
    setSaved(false);
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, prompt_template } : q)));
  }

  function removeQuestion(i: number) {
    setSaved(false);
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    setSaved(false);
    setQuestions((qs) => {
      const target = i + dir;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  function addQuestion() {
    setSaved(false);
    setQuestions((qs) => [...qs, { id: newId(), prompt_template: "" }]);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await api.updateDocumentTemplate(selected.template_key, {
        section_a_intro: sectionAIntro,
        section_a_questions: questions,
        section_b_text: sectionBText,
        section_c_note: sectionCNote,
      });
      setTemplates((prev) => prev.map((t) => (t.template_key === updated.template_key ? updated : t)));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const mergeFields = selectedKey ? DOCUMENT_TEMPLATE_MERGE_FIELDS[selectedKey] : [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Document Templates</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The structured documents generated and sent when Step 2 (Reference Check) or Step 4 (HR Background Verification) is
          initiated. Each is merged with the candidate&apos;s own data at send time.
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
                  <code key={f} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {`{{${f}}}`}
                  </code>
                ))}
              </div>
            </Field>

            <Field label="Section A — intro">
              <textarea
                className={inputClass}
                rows={2}
                value={sectionAIntro}
                onChange={(e) => { setSectionAIntro(e.target.value); setSaved(false); }}
              />
            </Field>

            <Field label="Section A — verification questions (in order)">
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={q.id} className="flex items-start gap-1.5">
                    <span className="mt-2 w-4 shrink-0 text-xs text-slate-400">{i + 1}.</span>
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={q.prompt_template}
                      onChange={(e) => updateQuestion(i, e.target.value)}
                    />
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveQuestion(i, -1)}
                        disabled={i === 0}
                        className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(i, 1)}
                        disabled={i === questions.length - 1}
                        className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(i)}
                        className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addQuestion} className="text-xs font-medium text-slate-600 underline dark:text-slate-400">
                  + Add question
                </button>
              </div>
            </Field>

            <Field label="Section B — rehire eligibility & comments">
              <textarea
                className={inputClass}
                rows={3}
                value={sectionBText}
                onChange={(e) => { setSectionBText(e.target.value); setSaved(false); }}
              />
            </Field>

            <Field label="Section C — verifier details note">
              <textarea
                className={inputClass}
                rows={2}
                value={sectionCNote}
                onChange={(e) => { setSectionCNote(e.target.value); setSaved(false); }}
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
