"use client";

import { useEffect, useState } from "react";
import { Field, inputClass } from "./Modal";
import {
  Client,
  CustomFieldDefinition,
  CustomFieldValues,
  Requisition,
  RequisitionStatus,
  REQUISITION_STATUS_LABELS,
  REQUISITION_URGENCY_LABELS,
  REQUISITION_URGENCY_ORDER,
  RequisitionUrgency,
} from "@/lib/types";
import { api } from "@/lib/api";
import { useActor } from "@/lib/actor-context";
import { CustomFieldsFields } from "./CustomFieldsFields";
import { RequisitionEditModal } from "./RequisitionEditModal";

const STATUS_BADGE: Record<RequisitionStatus, string> = {
  raised: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  fulfilled: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function RequisitionsView({
  initialRequisitions,
  customFieldDefinitions,
}: {
  initialRequisitions: Requisition[];
  customFieldDefinitions: CustomFieldDefinition[];
}) {
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);

  useEffect(() => {
    api.listClients().then(setClients).catch(() => {});
  }, []);

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setAddClientError(null);
    setAddingClient(true);
    try {
      const created = await api.createClient(newClientName.trim());
      setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(created.id);
      setNewClientName("");
    } catch (err) {
      setAddClientError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAddingClient(false);
    }
  }

  const [title, setTitle] = useState("");
  const [urgency, setUrgency] = useState<RequisitionUrgency>("medium");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [location, setLocation] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [closureTatDays, setClosureTatDays] = useState(30);
  const [mustHaveSkills, setMustHaveSkills] = useState("");
  const [budgetBand, setBudgetBand] = useState("");
  const [positionType, setPositionType] = useState<"experienced" | "fresher_intern">("experienced");
  const [hiringManager, setHiringManager] = useState("");
  const [hiringManagerEmail, setHiringManagerEmail] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipApproval, setSkipApproval] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValues>({});
  const [editingRequisition, setEditingRequisition] = useState<Requisition | null>(null);
  const { user } = useActor();
  const isHrManagement = user?.role === "hr_management";

  function resetForm() {
    setTitle("");
    setUrgency("medium");
    setDescription("");
    setDepartment("");
    setLevel("");
    setLocation("");
    setHeadcount(1);
    setClosureTatDays(30);
    setMustHaveSkills("");
    setBudgetBand("");
    setPositionType("experienced");
    setHiringManager("");
    setHiringManagerEmail("");
    setJdFile(null);
    setSkipApproval(false);
    setCustomFieldValues({});
  }

  function handleJdFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setJdFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmation(null);

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
      let req = await api.createRequisition({
        title,
        client_id: clientId,
        urgency,
        description: description || undefined,
        department: department || undefined,
        level: level || undefined,
        location: location || undefined,
        headcount,
        must_have_skills: mustHaveSkills || undefined,
        budget_band: budgetBand || undefined,
        position_type: positionType,
        hiring_manager: hiringManager,
        hiring_manager_email: hiringManagerEmail || undefined,
        closure_tat_days: closureTatDays,
        approval_skipped: isHrManagement ? skipApproval : undefined,
        custom_fields: customFieldValues,
      });

      if (jdFile) {
        try {
          req = await api.uploadRequisitionJd(req.id, jdFile);
        } catch (uploadErr) {
          setRequisitions((rs) => [req, ...rs]);
          setError(
            `${req.title} was raised, but the JD upload failed: ${
              uploadErr instanceof Error ? uploadErr.message : "please retry from this requisition."
            }`
          );
          resetForm();
          return;
        }
      }

      setRequisitions((rs) => [req, ...rs]);
      setConfirmation(`${req.title} (${req.req_code}) raised${skipApproval ? " and approved" : ""}.`);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Requisitions</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Raise a new requisition and see every requisition raised so far.</p>
      </div>

      {confirmation && (
        <div className="mb-3 max-w-3xl rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {confirmation}
        </div>
      )}

      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <form onSubmit={handleSubmit}>
          <Field label="Client *">
            <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Select a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <input
                className={inputClass}
                placeholder="+ Add new client"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
              <button
                type="button"
                onClick={handleAddClient}
                disabled={addingClient || !newClientName.trim()}
                className="rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {addingClient ? "Adding…" : "+ Add"}
              </button>
            </div>
            {addClientError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{addClientError}</p>}
          </Field>

          <Field label="Role title *">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
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
              <input className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. L4" />
            </Field>
            <Field label="Location">
              <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Headcount">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={headcount}
                onChange={(e) => setHeadcount(Number(e.target.value))}
              />
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

          {/* The actual point of this page: real room for these two fields
              instead of the 2-3 cramped rows they got inside the old modal. */}
          <Field label="Role description / responsibilities">
            <textarea
              className={inputClass}
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Day-to-day responsibilities and scope of the role"
            />
          </Field>
          <Field label="Must-have skills">
            <textarea
              className={inputClass}
              rows={6}
              value={mustHaveSkills}
              onChange={(e) => setMustHaveSkills(e.target.value)}
              placeholder="One per line, or however you'd naturally write it up"
            />
          </Field>

          <Field label="JD document (PDF or Word, optional)">
            {jdFile ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-600">
                <span className="truncate text-slate-700 dark:text-slate-300">{jdFile.name}</span>
                <button
                  type="button"
                  onClick={() => setJdFile(null)}
                  className="shrink-0 text-xs font-medium text-red-500 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                + Attach a formal JD document
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleJdFileChange} />
              </label>
            )}
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              In addition to the description above, not a replacement — useful when there's a formal JD doc with more
              detail than what's typed in here.
            </p>
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
              />
            </Field>
          </div>

          <CustomFieldsFields definitions={customFieldDefinitions} values={customFieldValues} onChange={setCustomFieldValues} />

          {isHrManagement && (
            <label className="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={skipApproval} onChange={(e) => setSkipApproval(e.target.checked)} />
              Approve immediately (skip Raised — only you can do this as HR Management)
            </label>
          )}

          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? "Submitting…" : "Submit requisition"}
          </button>
        </form>
      </div>

      <div className="mt-6 max-w-3xl">
        <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          All requisitions <span className="font-normal text-slate-400 dark:text-slate-500">({requisitions.length})</span>
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {requisitions.length === 0 ? (
            <p className="p-4 text-xs text-slate-400 dark:text-slate-500">No requisitions raised yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {requisitions.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setEditingRequisition(r)}
                    className="flex w-full items-center justify-between gap-3 bg-white px-4 py-2.5 text-left hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500">{r.req_code}</span>
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {[r.client?.name, r.department, r.location].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                      {REQUISITION_STATUS_LABELS[r.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editingRequisition && (
        <RequisitionEditModal
          requisition={editingRequisition}
          clients={clients}
          customFieldDefinitions={customFieldDefinitions}
          isHrManagement={isHrManagement}
          onClose={() => setEditingRequisition(null)}
          onUpdated={(updated) => setRequisitions((rs) => rs.map((r) => (r.id === updated.id ? updated : r)))}
        />
      )}
    </div>
  );
}
