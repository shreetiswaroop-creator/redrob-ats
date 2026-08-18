"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DATE_RANGE_OPTIONS, DateRangeKey, RecruiterMetrics } from "@/lib/recruiterMetrics";

type ColumnKey =
  | "owner"
  | "activePipelineSize"
  | "requisitionsClosedInPeriod"
  | "avgTimeToFillDays"
  | "candidatesSourcedInPeriod"
  | "candidatesScreenedInPeriod"
  | "offerAcceptance"
  | "tatAdherence"
  | "graceExtensionsRequestedInPeriod"
  | "rejectedTotal"
  | "timeToFirstActionHours";

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "owner", label: "Recruiter" },
  { key: "activePipelineSize", label: "Active pipeline" },
  { key: "requisitionsClosedInPeriod", label: "Closed" },
  { key: "avgTimeToFillDays", label: "Avg. time to fill" },
  { key: "candidatesSourcedInPeriod", label: "Sourced" },
  { key: "candidatesScreenedInPeriod", label: "Screened" },
  { key: "offerAcceptance", label: "Offer acceptance" },
  { key: "tatAdherence", label: "TAT adherence" },
  { key: "graceExtensionsRequestedInPeriod", label: "Grace ext. requested" },
  { key: "rejectedTotal", label: "Rejected" },
  { key: "timeToFirstActionHours", label: "Time to first action" },
];

function sortValue(m: RecruiterMetrics, key: ColumnKey): number | string {
  switch (key) {
    case "owner":
      return m.owner.toLowerCase();
    case "avgTimeToFillDays":
      return m.avgTimeToFillDays ?? -1;
    case "offerAcceptance":
      return m.offerAcceptance.ratePercent ?? -1;
    case "tatAdherence":
      return m.tatAdherence.adherencePercent ?? -1;
    case "timeToFirstActionHours":
      return m.timeToFirstActionHours ?? -1;
    default:
      return m[key] as number;
  }
}

function displayValue(m: RecruiterMetrics, key: ColumnKey): string {
  switch (key) {
    case "owner":
      return m.owner;
    case "activePipelineSize":
      return String(m.activePipelineSize);
    case "requisitionsClosedInPeriod":
      return String(m.requisitionsClosedInPeriod);
    case "avgTimeToFillDays":
      return m.avgTimeToFillDays !== null ? `${m.avgTimeToFillDays}d` : "—";
    case "candidatesSourcedInPeriod":
      return String(m.candidatesSourcedInPeriod);
    case "candidatesScreenedInPeriod":
      return String(m.candidatesScreenedInPeriod);
    case "offerAcceptance":
      return m.offerAcceptance.ratePercent !== null ? `${m.offerAcceptance.ratePercent}%` : "—";
    case "tatAdherence":
      return m.tatAdherence.adherencePercent !== null ? `${m.tatAdherence.adherencePercent}%` : "—";
    case "graceExtensionsRequestedInPeriod":
      return String(m.graceExtensionsRequestedInPeriod);
    case "rejectedTotal":
      return String(m.rejectedTotal);
    case "timeToFirstActionHours":
      return m.timeToFirstActionHours !== null ? `${m.timeToFirstActionHours}h` : "—";
  }
}

export function RecruiterComparisonView({ metrics, range }: { metrics: RecruiterMetrics[]; range: DateRangeKey }) {
  const [sortKey, setSortKey] = useState<ColumnKey>("activePipelineSize");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...metrics];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [metrics, sortKey, sortDir]);

  function handleSort(key: ColumnKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recruiter Comparison</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Every recruiter's numbers side by side — visible to HR Management only. Click a column to sort. Period-based
            columns (Closed, Sourced, Screened, Grace ext.) reflect the selected range; the rest reflect current state.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {DATE_RANGE_OPTIONS.map((o) => (
            <Link
              key={o.key}
              href={`/recruiter-comparison?range=${o.key}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                range === o.key
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {col.label}
                    {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.owner} className="border-t border-slate-100 text-slate-700 dark:border-slate-700 dark:text-slate-300">
                {COLUMNS.map((col) => (
                  <td key={col.key} className={`whitespace-nowrap px-3 py-2 ${col.key === "owner" ? "font-medium text-slate-900 dark:text-slate-100" : ""}`}>
                    {displayValue(m, col.key)}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">
                  No candidates recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
