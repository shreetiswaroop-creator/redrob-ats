"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputClass } from "./Modal";
import { Client, CustomFieldDefinition, CustomFieldValues, Requisition, REQUISITION_URGENCY_LABELS, REQUISITION_URGENCY_ORDER, RequisitionUrgency } from "@/lib/types";
import { api } from "@/lib/api";
import { useActor } from "@/lib/actor-context";
import { CustomFieldsFields } from "./CustomFieldsFields";

export function NewRequisitionModal({
  onClose,
  onCreated,
  customFieldDefinitions,
}: {
  onClose: () => void;
  onCreated: (req: Requisition) => void;
  customFieldDefinitions: CustomFieldDefinition[];
}) {
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipApproval, setSkipApproval] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValues>({});
  const { user } = useActor();
  const isHrManagement = user?.role === "hr_management";

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
      const req = await api.createRequisition({
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
      onCreated(req);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Raise a new requisition" onClose={onClose}>
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <input className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </Field>
          <Field label="Level">
            <input className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. L4" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">
            <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Headcount">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={headcount}
              onChange={(e) => setHeadcount(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Target closure (days)">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={closureTatDays}
            onChange={(e) => setClosureTatDays(Number(e.target.value))}
          />
        </Field>
        <Field label="Role description / responsibilities">
          <textarea
            className={inputClass}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Day-to-day responsibilities and scope of the role"
          />
        </Field>
        <Field label="Must-have skills">
          <textarea
            className={inputClass}
            rows={2}
            value={mustHaveSkills}
            onChange={(e) => setMustHaveSkills(e.target.value)}
          />
        </Field>
        <Field label="Budget band">
          <input className={inputClass} value={budgetBand} onChange={(e) => setBudgetBand(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hiring Manager *">
            <input className={inputClass} value={hiringManager} onChange={(e) => setHiringManager(e.target.value)} />
          </Field>
          <Field label="Hiring Manager email">
            <input className={inputClass} value={hiringManagerEmail} onChange={(e) => setHiringManagerEmail(e.target.value)} placeholder="for notifications" />
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
    </Modal>
  );
}
