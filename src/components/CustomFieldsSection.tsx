"use client";

import { useState } from "react";
import { Field, inputClass } from "./Modal";
import { api } from "@/lib/api";
import { CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS, CustomFieldDefinition, CustomFieldEntityType, CustomFieldType } from "@/lib/types";

const TABS: { key: CustomFieldEntityType; label: string }[] = [
  { key: "candidate", label: "Candidate fields" },
  { key: "requisition", label: "Requisition fields" },
];

function AddFieldForm({ entityType, onAdded }: { entityType: CustomFieldEntityType; onAdded: (def: CustomFieldDefinition) => void }) {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addOption() {
    const trimmed = newOption.trim();
    if (!trimmed || options.includes(trimmed)) return;
    setOptions((o) => [...o, trimmed]);
    setNewOption("");
  }

  function removeOption(opt: string) {
    setOptions((o) => o.filter((x) => x !== opt));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (fieldType === "select" && options.length === 0) {
      setError("Add at least one option for a select field.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createCustomField({
        entity_type: entityType,
        label: label.trim(),
        field_type: fieldType,
        select_options: fieldType === "select" ? options : undefined,
        required,
      });
      onAdded(created);
      setLabel("");
      setFieldType("text");
      setRequired(false);
      setOptions([]);
      setNewOption("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Label">
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Visa status" />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomFieldType)}>
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {CUSTOM_FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {fieldType === "select" && (
        <Field label="Options">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {options.map((opt) => (
              <span
                key={opt}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-300"
              >
                {opt}
                <button type="button" onClick={() => removeOption(opt)} className="text-slate-400 hover:text-red-500">
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
              placeholder="Type an option, press Enter"
            />
            <button
              type="button"
              onClick={addOption}
              className="shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              + Add
            </button>
          </div>
        </Field>
      )}

      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required
      </label>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {submitting ? "Adding…" : "+ Add field"}
      </button>
    </form>
  );
}

function DefinitionRow({
  def,
  isFirst,
  isLast,
  onMove,
  onDelete,
}: {
  def: CustomFieldDefinition;
  isFirst: boolean;
  isLast: boolean;
  onMove: (def: CustomFieldDefinition, dir: -1 | 1) => void;
  onDelete: (def: CustomFieldDefinition) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{def.label}</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {CUSTOM_FIELD_TYPE_LABELS[def.field_type]}
          </span>
          {def.required && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Required
            </span>
          )}
        </div>
        {def.field_type === "select" && def.select_options && (
          <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">Options: {def.select_options.join(", ")}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => onMove(def, -1)}
          disabled={isFirst}
          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(def, 1)}
          disabled={isLast}
          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => onDelete(def)}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function CustomFieldsSection({ initialDefinitions }: { initialDefinitions: CustomFieldDefinition[] }) {
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [tab, setTab] = useState<CustomFieldEntityType>("candidate");
  const [pendingDelete, setPendingDelete] = useState<{ def: CustomFieldDefinition; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scoped = definitions.filter((d) => d.entity_type === tab).sort((a, b) => a.display_order - b.display_order);

  async function handleMove(def: CustomFieldDefinition, dir: -1 | 1) {
    setError(null);
    const idx = scoped.findIndex((d) => d.id === def.id);
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= scoped.length) return;
    const neighbor = scoped[targetIdx];
    try {
      const [updatedDef, updatedNeighbor] = await Promise.all([
        api.updateCustomField(def.id, { display_order: neighbor.display_order }),
        api.updateCustomField(neighbor.id, { display_order: def.display_order }),
      ]);
      setDefinitions((defs) =>
        defs.map((d) => (d.id === updatedDef.id ? updatedDef : d.id === updatedNeighbor.id ? updatedNeighbor : d))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleDelete(def: CustomFieldDefinition, confirm?: boolean) {
    setError(null);
    try {
      const result = await api.deleteCustomField(def.id, confirm);
      if (!result.deleted) {
        setPendingDelete({ def, count: result.count });
        return;
      }
      setDefinitions((defs) => defs.filter((d) => d.id !== def.id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Custom Fields</h2>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Add fields to Candidate or Requisition without an engineering ticket. New fields appear on the creation form and detail
        view immediately.
      </p>

      <div className="mb-4 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-indigo-600 text-white dark:bg-indigo-500"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mb-4 space-y-2">
        {scoped.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No custom fields yet.</p>}
        {scoped.map((def, i) => (
          <DefinitionRow
            key={def.id}
            def={def}
            isFirst={i === 0}
            isLast={i === scoped.length - 1}
            onMove={handleMove}
            onDelete={(d) => handleDelete(d)}
          />
        ))}
      </div>

      {pendingDelete && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="mb-2 font-semibold">
            {pendingDelete.count} existing {pendingDelete.def.entity_type === "candidate" ? "candidate" : "requisition"}
            {pendingDelete.count === 1 ? "" : "s"} already {pendingDelete.count === 1 ? "has" : "have"} a value for &ldquo;
            {pendingDelete.def.label}&rdquo;. Deleting this field definition won&apos;t remove that data — it just becomes
            unlabeled/orphaned. Delete anyway?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleDelete(pendingDelete.def, true)}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              Delete anyway
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AddFieldForm entityType={tab} onAdded={(def) => setDefinitions((defs) => [...defs, def])} />
    </div>
  );
}
