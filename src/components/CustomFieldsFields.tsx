"use client";

import { Field, inputClass } from "./Modal";
import { CustomFieldDefinition, CustomFieldValues } from "@/lib/types";

// Shared renderer for admin-defined custom fields — used both on the create
// forms (CandidatesView, NewRequisitionModal) and the detail/edit views
// (CandidateDetailPanel, RequisitionCardFace). `onChange` always receives the
// FULL updated values object (full-replace semantics, matching every other
// jsonb column in this app and validateCustomFieldValues on the server) —
// text/number/date commit on blur (only when actually changed, same
// convention as every other free-text field in this app); boolean/select
// commit immediately on change.
export function CustomFieldsFields({
  definitions,
  values,
  onChange,
}: {
  definitions: CustomFieldDefinition[];
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
}) {
  if (definitions.length === 0) return null;
  const sorted = [...definitions].sort((a, b) => a.display_order - b.display_order);

  function commit(fieldKey: string, value: string | number | boolean | null) {
    onChange({ ...values, [fieldKey]: value });
  }

  return (
    <div className="mb-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Custom fields</p>
      <div className="grid grid-cols-2 gap-3">
        {sorted.map((def) => {
          const current = values[def.field_key] ?? null;
          return (
            <Field key={def.id} label={`${def.label}${def.required ? " *" : ""}`}>
              {def.field_type === "text" && (
                <input
                  className={inputClass}
                  defaultValue={(current as string) ?? ""}
                  onBlur={(e) => e.target.value !== (current ?? "") && commit(def.field_key, e.target.value || null)}
                />
              )}
              {def.field_type === "number" && (
                <input
                  type="number"
                  className={inputClass}
                  defaultValue={current === null ? "" : String(current)}
                  onBlur={(e) => {
                    const next = e.target.value === "" ? null : Number(e.target.value);
                    if (next !== current) commit(def.field_key, next);
                  }}
                />
              )}
              {def.field_type === "date" && (
                <input
                  type="date"
                  className={inputClass}
                  defaultValue={(current as string) ?? ""}
                  onBlur={(e) => e.target.value !== (current ?? "") && commit(def.field_key, e.target.value || null)}
                />
              )}
              {def.field_type === "boolean" && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={!!current} onChange={(e) => commit(def.field_key, e.target.checked)} />
                  Yes
                </label>
              )}
              {def.field_type === "select" && (
                <select
                  className={inputClass}
                  value={(current as string) ?? ""}
                  onChange={(e) => commit(def.field_key, e.target.value || null)}
                >
                  <option value="">— Select —</option>
                  {(def.select_options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          );
        })}
      </div>
    </div>
  );
}
