"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeDashboardMetrics } from "@/lib/dashboardMetrics";
import { Candidate, Requisition, UserRole } from "@/lib/types";
import { StatTile } from "./charts/StatTile";
import { BarChart } from "./charts/BarChart";
import { DonutChart } from "./charts/DonutChart";
import { CATEGORICAL, SEQUENTIAL_BLUE, STATUS, MUTED } from "@/lib/chartColors";

type DateRangeKey = "7d" | "30d" | "90d" | "all";

const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const TAT_SLOT: Record<string, typeof STATUS.good> = {
  on_track: STATUS.good,
  at_risk: STATUS.warning,
  breached: STATUS.critical,
};

// Requisition status has a natural pipeline order (raised -> approved ->
// fulfilled, with on_hold/expired as side states) rather than being an
// unordered part-to-whole breakdown, so it's colored by what each status
// MEANS: fulfilled is the positive outcome (good/green), on_hold and
// expired are risk states (warning/critical), and raised/approved are
// just in-progress pipeline steps (neutral blue), never cycling through
// the categorical palette.
const REQ_STATUS_SLOT: Record<string, typeof STATUS.good> = {
  raised: SEQUENTIAL_BLUE[0],
  approved: SEQUENTIAL_BLUE[2],
  fulfilled: STATUS.good,
  on_hold: STATUS.warning,
  expired: STATUS.critical,
};

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.3 3.3l1 1M11.7 11.7l1 1M3.3 12.7l1-1M11.7 4.3l1-1" />
    </svg>
  );
}

function ApprovalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="2" width="11" height="12.5" rx="1.2" />
      <path d="M5.5 2V1.2a.7.7 0 0 1 .7-.7h3.6a.7.7 0 0 1 .7.7V2" />
      <path d="M5.3 8.3l1.8 1.8 3.4-3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="5" width="13" height="8.5" rx="1.2" />
      <path d="M5.5 5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5" />
      <path d="M1.5 9h13" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="5" r="2.6" />
      <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
    </svg>
  );
}

function OfferIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="1.5" width="12" height="13" rx="1.2" />
      <path d="M5 6.5l2 2 4-4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11h6" strokeLinecap="round" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5.5 3v10" />
      <path d="M10.5 3v10" />
    </svg>
  );
}

function AlertClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8.5" r="6" />
      <path d="M8 5.3v3.5l2.2 1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 1.5h4" strokeLinecap="round" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.3" />
      <path d="M6 6l4 4M10 6l-4 4" strokeLinecap="round" />
    </svg>
  );
}

function StopwatchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="9" r="5.5" />
      <path d="M8 6v3.2l2 1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.3 1.5h3.4" strokeLinecap="round" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h8" />
      <path d="M4 14h8" />
      <path d="M4.5 2c0 3 2 4 3.5 5-1.5 1-3.5 2-3.5 5" />
      <path d="M11.5 2c0 3-2 4-3.5 5 1.5 1 3.5 2 3.5 5" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.3" />
      <path d="M5.3 8.2l1.8 1.8 3.6-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function DashboardView({
  requisitions,
  candidates,
  userName,
  userRole,
}: {
  requisitions: Requisition[];
  candidates: Candidate[];
  userName: string;
  userRole: UserRole;
}) {
  const [range, setRange] = useState<DateRangeKey>("all");

  const welcomeSubtitle =
    userRole === "hr_management"
      ? "Here's what needs your attention across the system."
      : "Here's what's moving in your pipeline today.";

  const { filteredRequisitions, filteredCandidates } = useMemo(() => {
    const option = DATE_RANGE_OPTIONS.find((o) => o.key === range)!;
    if (option.days === null) return { filteredRequisitions: requisitions, filteredCandidates: candidates };
    const cutoff = Date.now() - option.days * MS_PER_DAY;
    return {
      filteredRequisitions: requisitions.filter((r) => new Date(r.created_at).getTime() >= cutoff),
      filteredCandidates: candidates.filter((c) => new Date(c.created_at).getTime() >= cutoff),
    };
  }, [range, requisitions, candidates]);

  const metrics = useMemo(
    () => computeDashboardMetrics(filteredRequisitions, filteredCandidates),
    [filteredRequisitions, filteredCandidates]
  );

  const avgTimePerStageItems = metrics.avgTimePerStage.map((s) => ({ key: s.key, label: s.label, count: s.days }));
  const recruiterLoadTop = metrics.recruiterLoad.slice(0, 8);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-xl border-y border-r border-y-slate-200 border-r-slate-200 border-l-4 border-l-indigo-300 bg-indigo-50/60 p-4 shadow-sm dark:border-y-slate-700 dark:border-r-slate-700 dark:border-l-indigo-800 dark:bg-indigo-950/20">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
          <SunIcon />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Welcome back, {userName}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{welcomeSubtitle}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A live snapshot of the hiring pipeline — requisitions raised and candidates added in the selected period.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {DATE_RANGE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setRange(o.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                range === o.key
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero KPIs — the 3 numbers that matter most at a glance */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          tone="hero"
          label="Active candidates"
          value={metrics.activeCandidates}
          icon={<PersonIcon />}
          description="Candidates with status Active — i.e. not yet Rejected — across every pipeline stage."
        />
        <StatTile
          tone="hero"
          label="Avg. time to fill"
          value={metrics.avgTimeToFillDays !== null ? `${metrics.avgTimeToFillDays}d` : "—"}
          icon={<StopwatchIcon />}
          description="Average calendar days from a requisition's creation to the earliest offer acceptance for it, averaged across requisitions that have had at least one acceptance."
        />
        <StatTile
          tone="hero"
          label="Offer acceptance rate"
          value={metrics.offerAcceptance.ratePercent !== null ? `${metrics.offerAcceptance.ratePercent}%` : "—"}
          icon={<CheckCircleIcon />}
          description="Share of candidates who ever reached Offer Process or later that went on to accept. 'Sent' is inferred from stage history — there's no separate offer-sent event logged."
        />
      </div>

      {/* Supporting pipeline counts */}
      <div className={`mb-3 grid gap-3 ${userRole === "hr_management" ? "grid-cols-3" : "grid-cols-2"}`}>
        <StatTile
          label="Open positions"
          value={metrics.openPositions}
          icon={<BriefcaseIcon />}
          description="Requisitions currently in Approved or On Hold status — excludes Raised (not yet approved), Fulfilled, and Expired."
        />
        <StatTile
          label="In offer process"
          value={metrics.inOfferProcess}
          icon={<OfferIcon />}
          description="Active candidates currently in the Offer Process or Offer Accepted stage."
        />
        {userRole === "hr_management" && (
          <Link href="/pipeline?status=raised" className="block rounded-xl transition-shadow hover:shadow-md">
            <StatTile
              label="Pending your approval"
              value={metrics.requisitionsPendingApproval}
              icon={<ApprovalIcon />}
              accent={metrics.requisitionsPendingApproval > 0 ? "warning" : undefined}
              description="Requisitions currently in Raised status, awaiting HR Management approval. Click to jump to them on the board."
            />
          </Link>
        )}
      </div>

      {/* Diagnostic / at-risk tiles — smaller and muted so they don't compete with the hero row, colored to draw the eye only when something actually needs attention */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          tone="compact"
          label="On hold"
          value={metrics.onHoldCandidates}
          statusTone="warning"
          accent={metrics.onHoldCandidates > 0 ? "warning" : undefined}
          icon={<PauseIcon />}
          description="Active candidates currently flagged On Hold (each requires a note explaining why)."
        />
        <StatTile
          tone="compact"
          label="TAT breached"
          value={metrics.tatBreached}
          statusTone={metrics.tatBreached > 0 ? "critical" : "good"}
          accent={metrics.tatBreached > 0 ? "critical" : "good"}
          icon={<AlertClockIcon />}
          description="Active candidates whose current offer step has used 100%+ of its allotted turnaround time — after accounting for any approved grace extension — as tracked on their record."
        />
        <StatTile
          tone="compact"
          label="Requisitions past closure TAT"
          value={metrics.requisitionsPastClosureTat}
          statusTone={metrics.requisitionsPastClosureTat > 0 ? "critical" : "good"}
          accent={metrics.requisitionsPastClosureTat > 0 ? "critical" : "good"}
          icon={<HourglassIcon />}
          description="Requisitions in Approved status where days elapsed since approval have reached 100%+ of the requisition's target closure days. A distinct, requisition-level metric from 'TAT breached' above (which tracks per-candidate offer-step TAT, not time-to-close) — Fulfilled/On Hold/Expired requisitions are excluded since a closed or paused position isn't breaching a closure deadline."
        />
        <StatTile
          tone="compact"
          label="Rejected"
          value={metrics.rejectedCandidates}
          statusTone="warning"
          icon={<XCircleIcon />}
          description="Candidates marked Rejected, from any pipeline stage."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart
          title="Candidates by stage"
          subtitle="Active candidates, sourcing → handover"
          items={metrics.candidatesByStage}
          colorFor={(_item, i) => SEQUENTIAL_BLUE[Math.min(i, SEQUENTIAL_BLUE.length - 1)]}
        />

        <SectionCard title="Requisition status" subtitle="Raised → Approved → Fulfilled, plus On Hold/Expired">
          <div className="flex h-6 w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-700">
            {metrics.requisitionStatusBreakdown
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.key}
                  className={REQ_STATUS_SLOT[s.key].bg}
                  style={{ width: `${(s.count / Math.max(1, metrics.totalRequisitions)) * 100}%` }}
                  title={`${s.label}: ${s.count}`}
                />
              ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {metrics.requisitionStatusBreakdown.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-xs">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${REQ_STATUS_SLOT[s.key].bg}`} />
                <span className="flex-1 truncate text-slate-600 dark:text-slate-400">{s.label}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{s.count}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <DonutChart
          title="TAT status"
          subtitle="Active candidates only"
          items={metrics.tatBreakdown}
          colorFor={(item) => TAT_SLOT[item.key] ?? MUTED}
        />

        <BarChart
          title="Priority breakdown"
          subtitle="Active candidates — recruiter-assigned, P1 highest"
          items={metrics.priorityBreakdown}
          colorFor={(item, i) => (item.key === "none" ? MUTED : SEQUENTIAL_BLUE[SEQUENTIAL_BLUE.length - 1 - i])}
        />

        <SectionCard title="Requisitions by department">
          <div className="flex flex-wrap gap-2">
            {metrics.departmentBreakdown.map((d) => (
              <span
                key={d.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300"
              >
                {d.label}
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-600 dark:text-slate-200">
                  {d.count}
                </span>
              </span>
            ))}
            {metrics.departmentBreakdown.every((d) => d.count === 0) && (
              <p className="text-xs text-slate-400 dark:text-slate-500">No data yet.</p>
            )}
          </div>
        </SectionCard>

        <BarChart
          title="Average time per stage"
          subtitle="Days currently spent by active candidates in each stage — spot bottlenecks"
          items={avgTimePerStageItems}
          colorFor={(_item, i) => SEQUENTIAL_BLUE[Math.min(i, SEQUENTIAL_BLUE.length - 1)]}
          formatValue={(item) => `${item.count}d`}
        />

        <BarChart
          title="Recruiter load"
          subtitle="Active candidates currently owned, per recruiter"
          items={recruiterLoadTop}
          colorFor={() => CATEGORICAL[0]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Source effectiveness" subtitle="Sourced vs. hired (offer accepted), by source">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="pb-2 pr-2 font-medium">Source</th>
                  <th className="pb-2 pr-2 font-medium">Sourced</th>
                  <th className="pb-2 pr-2 font-medium">Hired</th>
                  <th className="pb-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {metrics.sourceEffectiveness.map((s) => (
                  <tr key={s.key} className="border-t border-slate-100 text-slate-700 dark:border-slate-700 dark:text-slate-300">
                    <td className="py-1.5 pr-2">{s.label}</td>
                    <td className="py-1.5 pr-2">{s.sourced}</td>
                    <td className="py-1.5 pr-2">{s.hired}</td>
                    <td className="py-1.5">{s.ratePercent !== null ? `${s.ratePercent}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Requisition aging" subtitle="Open more than 30 days (Raised/Approved/On Hold)">
          {metrics.agingRequisitions.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">Nothing flagged — all open requisitions are within 30 days.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {metrics.agingRequisitions.map((r) => (
                <li key={r.requisitionId} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                  <span className="truncate">
                    {r.reqCode} — {r.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    {r.daysOpen}d open
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {metrics.timeToFillByRequisition.length > 0 && (
        <div className="mt-4">
          <SectionCard title="Time to fill by requisition" subtitle="Raised → earliest offer acceptance">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="pb-2 pr-2 font-medium">Requisition</th>
                    <th className="pb-2 font-medium">Days to fill</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.timeToFillByRequisition.map((t) => (
                    <tr key={t.requisitionId} className="border-t border-slate-100 text-slate-700 dark:border-slate-700 dark:text-slate-300">
                      <td className="py-1.5 pr-2">
                        {t.reqCode} — {t.title}
                      </td>
                      <td className="py-1.5">{t.days}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Total requisitions"
          value={metrics.totalRequisitions}
          tone="compact"
          description="All requisitions ever created, in any status (Raised, Approved, Fulfilled, On Hold, or Expired)."
        />
        <StatTile
          label="Experienced-track candidates"
          value={metrics.experiencedCandidates}
          tone="compact"
          description="Active candidates on the Experienced track."
        />
        <StatTile
          label="Fresher/Intern-track candidates"
          value={metrics.fresherInternCandidates}
          tone="compact"
          description="Active candidates on the Fresher/Intern track."
        />
      </div>
    </div>
  );
}
