import { CustomFieldDefinition, CustomFieldValues } from "./types";

// Slug used as the JSONB key — derived from the label at creation time and
// never changed afterward (renaming would orphan any data already stored
// under the old key).
export function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Validates a full custom_fields blob against a set of definitions for one
// entity type. Full-replace semantics, matching every other jsonb column in
// this app (offer_steps, employment_history, ...) — the caller always sends
// the complete set of active fields, not a partial patch. Unknown keys are
// dropped rather than trusted through, so the client can't smuggle arbitrary
// data into the jsonb column.
export function validateCustomFieldValues(
  definitions: CustomFieldDefinition[],
  values: unknown
): { ok: true; cleaned: CustomFieldValues } | { ok: false; error: string } {
  const input = (values && typeof values === "object" ? (values as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const cleaned: CustomFieldValues = {};

  for (const def of definitions) {
    const raw = input[def.field_key];
    const isEmpty = raw === undefined || raw === null || raw === "";

    if (isEmpty) {
      if (def.required) {
        return { ok: false, error: `"${def.label}" is required.` };
      }
      cleaned[def.field_key] = null;
      continue;
    }

    switch (def.field_type) {
      case "text": {
        if (typeof raw !== "string") return { ok: false, error: `"${def.label}" must be text.` };
        cleaned[def.field_key] = raw.trim();
        break;
      }
      case "number": {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) return { ok: false, error: `"${def.label}" must be a number.` };
        cleaned[def.field_key] = n;
        break;
      }
      case "date": {
        if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) {
          return { ok: false, error: `"${def.label}" must be a valid date.` };
        }
        cleaned[def.field_key] = raw;
        break;
      }
      case "boolean": {
        if (typeof raw !== "boolean") return { ok: false, error: `"${def.label}" must be true or false.` };
        cleaned[def.field_key] = raw;
        break;
      }
      case "select": {
        const options = def.select_options ?? [];
        if (typeof raw !== "string" || !options.includes(raw)) {
          return { ok: false, error: `"${def.label}" must be one of: ${options.join(", ")}.` };
        }
        cleaned[def.field_key] = raw;
        break;
      }
    }
  }

  return { ok: true, cleaned };
}
