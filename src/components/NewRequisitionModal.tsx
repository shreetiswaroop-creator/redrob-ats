"use client";

import { useState } from "react";
import { Modal, Field, inputClass } from "./Modal";
import { Requisition } from "@/lib/types";
import { api } from "@/lib/api";

export function NewRequisitionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (req: Requisition) => void;
}) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [location, setLocation] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [mustHaveSkills, setMustHaveSkills] = useState("");
  const [budgetBand, setBudgetBand] = useState("");
  const [positionType, setPositionType] = useState<"experienced" | "fresher_intern">("experienced");
  const [hiringManager, setHiringManager] = useState("");
  const [hiringManagerEmail, setHiringManagerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !hiringManager.trim()) {
      setError("Role title and Hiring Manager are required.");
      return;
    }

    setSubmitting(true);
    try {
      const req = await api.createRequisition({
        title,
        department: department || undefined,
        level: level || undefined,
        location: location || undefined,
        headcount,
        must_have_skills: mustHaveSkills || undefined,
        budget_band: budgetBand || undefined,
        position_type: positionType,
        hiring_manager: hiringManager,
        hiring_manager_email: hiringManagerEmail || undefined,
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
        <Field label="Role title *">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
        </Field>
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
        <Field label="Must-have skills">
          <textarea
            className={inputClass}
            rows={2}
            value={mustHaveSkills}
            onChange={(e) => setMustHaveSkills(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget band">
            <input className={inputClass} value={budgetBand} onChange={(e) => setBudgetBand(e.target.value)} />
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
          <Field label="Hiring Manager *">
            <input className={inputClass} value={hiringManager} onChange={(e) => setHiringManager(e.target.value)} />
          </Field>
          <Field label="Hiring Manager email">
            <input className={inputClass} value={hiringManagerEmail} onChange={(e) => setHiringManagerEmail(e.target.value)} placeholder="for notifications" />
          </Field>
        </div>

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
