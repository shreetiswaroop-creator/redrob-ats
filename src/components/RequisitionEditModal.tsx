"use client";

import { useState } from "react";
import { Modal, Field, inputClass } from "./Modal";
import {
  Client,
  CustomFieldDefinition,
  CustomFieldValues,
  Requisition,
  REQUISITION_URGENCY_LABELS,
  REQUISITION_URGENCY_ORDER,
  RequisitionUrgency,
} from "@/lib/types";
import { api } from "@/lib/api";
import { CustomFieldsFields } from "./CustomFieldsFields";

// Every field here is editable regardless of the requisition's status —
// there's no "locked once Approved" state in this app. Status itself isn't
// edited here on purpose: status transitions have real side effects
// (notifications, archiving candidates) already owned by the Kanban card's
// dedicated dropdown; this modal only ever touches the requisition's own
// details, never its lifecycle state.
export function RequisitionEditModal({
  requisition,
  clients,
  customFieldDefinitions,
  isHrManagement,
  onClose,
  onUpdated,
}: {
  requisition: Requisition;
  clients: Client[];
  customFieldDefinitions: CustomFieldDefinition[];
  isHrManagement: boolean;
  onClose: () => void;
  onUpdated: (r: Requisition) => void;
}) {
  const [clientId, setClientId] = useState(requisition.client_id);
  const [title, setTitle] = useState(requisition.title);
  const [urgency, setUrgency] = useState<RequisitionUrgency>(requisition.urgency);
  const [positionType, setPositionType] = useState<"experienced" | "fresher_intern">(requisition.position_type);
  const [department, setDepartment] = useState(requisition.department ?? "");
  const [level, setLevel] = useState(requisition.level ?? "");
  const [location, setLocation] = useState(requisition.location ?? "");
  const [headcount, setHeadcount] = useState(requisition.headcount);
  const [closureTatDays, setClosureTatDays] = useState(requisition.closure_tat_days);
  const [description, setDescription] = useState(requisition.description ?? "");
  const [mustHaveSkills, setMustHaveSkills] = useState(requisition.must_have_skills ?? "");
  const [budgetBand, setBudgetBand] = useState(requisition.budget_band ?? "");
  const [hiringManager, setHiringManager] = useState(requisition.hiring_manager);
  const [hiringManagerEmail, setHiringManagerEmail] = useState(requisition.hiring_manager_email ?? "");
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValues>(requisition.custom_fields ?? {});
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [uploadingJd, setUploadingJd] = useState(false);
  const [jdPathname, setJdPathname] = useState(requisition.jd_pathname);
  const [jdFilename, setJdFilename] = useState(requisition.jd_filename);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleJdFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setJdFile(file);
  }

  async function handleRemoveJd() {
    setError(null);
    try {
      const updated = await api.deleteRequisitionJd(requisition.id);
      setJdPathname(updated.jd_pathname);
      setJdFilename(updated.jd_filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the JD document.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !hiringManager.trim() || !clientId) {
      setError("Client, Role title, and Hiring Manager are required.");
      return;
    }
    for (const def of customFieldDefinitions) {
      const v = customFieldValues[def.field_key];
      if (def.required && (v === undefined || v === null || v === "")) {
        setError(`"${def.label}" is required.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      let updated = await api.updateRequisitionDetails(requisition.id, {
        title,
        client_id: clientId,
        urgency,
        position_type: positionType,
        department: department || undefined,
        level: level || undefined,
        location: location || undefined,
        headcount,
        description: description || undefined,
        must_have_skills: mustHaveSkills || undefined,
        budget_band: budgetBand || undefined,
        hiring_manager: hiringManager,
        // Omit entirely for non-HR — the server also enforces this, but this
        // way a recruiter's unrelated save never even attempts to touch it.
        ...(isHrManagement ? { hiring_manager_email: hiringManagerEmail || undefined } : {}),
        custom_fields: customFieldValues,
      });

      if (closureTatDays !== requisition.closure_tat_days) {
        updated = await api.updateRequisitionClosureTat(requisition.id, closureTatDays);
      }

      if (jdFile) {
        setUploadingJd(true);
        try {
          updated = await api.uploadRequisitionJd(requisition.id, jdFile);
        } catch (uploadErr) {
          onUpdated(updated);
          setError(uploadErr instanceof Error ? uploadErr.message : "Details saved, but the JD upload failed.");
          setUploadingJd(false);
          setSubmitting(false);
          return;
        }
        setUploadingJd(false);
      }

      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${requisition.req_code}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <Field label="Client *">
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Role title *">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Urgency">
            <select className={inputClass} value={urgency} onChange={(e) => setUrgency(e.target.value as RequisitionUrgency)}>
              {REQUISITION_URGENCY_ORDER.map((u) => (
                <option key={u} value={u}>
                  {REQUISITION_URGENCY_LABELS[u]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Position type *">
            <select
              className={inputClass}
              value={positionType}
              onChange={(e) => setPositionType(e.target.value as "experienced" | "fresher_intern")}
            >
              <option value="experienced">Experienced Hire</option>
              <option value="fresher_intern">Intern / Fresher</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Department">
            <input className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </Field>
          <Field label="Level">
            <input className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)} />
          </Field>
          <Field label="Location">
            <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Headcount">
            <input type="number" min={1} className={inputClass} value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} />
          </Field>
          <Field label="Target closure (days)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={closureTatDays}
              onChange={(e) => setClosureTatDays(Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Role description / responsibilities">
          <textarea className={inputClass} rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Must-have skills">
          <textarea className={inputClass} rows={4} value={mustHaveSkills} onChange={(e) => setMustHaveSkills(e.target.value)} />
        </Field>

        <Field label="JD document (PDF or Word, optional)">
          {jdFile ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-600">
              <span className="truncate text-slate-700 dark:text-slate-300">{jdFile.name} (will replace on save)</span>
              <button type="button" onClick={() => setJdFile(null)} className="shrink-0 text-xs font-medium text-red-500 hover:underline dark:text-red-400">
                Cancel
              </button>
            </div>
          ) : jdFilename ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-600">
              <a
                href={`/api/requisitions/${requisition.id}/jd`}
                className="truncate text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              >
                {jdFilename}
              </a>
              <div className="flex shrink-0 items-center gap-3">
                <label className="cursor-pointer text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                  Replace
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleJdFileChange} />
                </label>
                <button type="button" onClick={handleRemoveJd} className="text-xs font-medium text-red-500 hover:underline dark:text-red-400">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
              {uploadingJd ? "Uploading…" : "+ Attach a formal JD document"}
              <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleJdFileChange} disabled={uploadingJd} />
            </label>
          )}
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">In addition to the description above, not a replacement.</p>
        </Field>

        <Field label="Budget band">
          <input className={inputClass} value={budgetBand} onChange={(e) => setBudgetBand(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hiring Manager *">
            <input className={inputClass} value={hiringManager} onChange={(e) => setHiringManager(e.target.value)} />
          </Field>
          <Field label="Hiring Manager email">
            <input
              className={inputClass}
              value={hiringManagerEmail}
              onChange={(e) => setHiringManagerEmail(e.target.value)}
              placeholder="for notifications"
              disabled={!isHrManagement}
              title={isHrManagement ? undefined : "Only HR Management can reassign the Hiring Manager email — it controls who can access this requisition's candidates."}
            />
            {!isHrManagement && (
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Only HR Management can change this — it controls Hiring Manager access to candidates.
              </p>
            )}
          </Field>
        </div>

        <CustomFieldsFields definitions={customFieldDefinitions} values={customFieldValues} onChange={setCustomFieldValues} />

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
