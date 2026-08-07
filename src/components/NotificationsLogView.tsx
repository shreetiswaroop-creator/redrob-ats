"use client";

import { Fragment, useMemo, useState } from "react";
import { Candidate, NotificationLogEntry, Requisition } from "@/lib/types";

export function NotificationsLogView({
  initialNotifications,
  requisitions,
  candidates,
}: {
  initialNotifications: NotificationLogEntry[];
  requisitions: Requisition[];
  candidates: Candidate[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [filterReqId, setFilterReqId] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requisitionById = useMemo(() => new Map(requisitions.map((r) => [r.id, r])), [requisitions]);
  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  async function handleFilterChange(reqId: string) {
    setFilterReqId(reqId);
    setLoading(true);
    try {
      const url = reqId === "all" ? "/api/notifications" : `/api/notifications?requisition_id=${reqId}`;
      const res = await fetch(url);
      setNotifications(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notifications log</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Every email the system would send (Section 6 of the PRD) — logged, not actually sent, until Gmail
            integration is wired up.
          </p>
        </div>
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          value={filterReqId}
          onChange={(e) => handleFilterChange(e.target.value)}
        >
          <option value="all">All requisitions</option>
          {requisitions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.req_code} — {r.title}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Candidate / Requisition</th>
              <th className="px-3 py-2">Recipients</th>
              <th className="px-3 py-2">Subject</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => {
              const requisition = n.requisition_id ? requisitionById.get(n.requisition_id) : undefined;
              const candidate = n.candidate_id ? candidateById.get(n.candidate_id) : undefined;
              const isExpanded = expandedId === n.id;
              return (
                <Fragment key={n.id}>
                  <tr
                    className="cursor-pointer border-t border-slate-100 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    onClick={() => setExpandedId(isExpanded ? null : n.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(n.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {n.trigger_event}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {candidate ? `${candidate.candidate_code} — ${candidate.name}` : requisition ? requisition.req_code : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {n.recipients.map((r) => r.role).join(", ")}
                    </td>
                    <td className="px-3 py-2">{n.subject}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
                      <td colSpan={5} className="px-3 py-3">
                        <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-700 dark:text-slate-300">To: </span>
                          {n.recipients
                            .map((r) => `${r.role}${r.name ? ` (${r.name})` : ""} <${r.email ?? "no email on file"}>`)
                            .join("; ")}
                        </div>
                        <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{n.body}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {notifications.length === 0 && !loading && (
          <p className="p-4 text-sm text-slate-400 dark:text-slate-500">No notifications logged yet.</p>
        )}
      </div>
    </div>
  );
}
