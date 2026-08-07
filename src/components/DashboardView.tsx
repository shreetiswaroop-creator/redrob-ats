"use client";

import { DashboardMetrics } from "@/lib/dashboardMetrics";
import { StatTile } from "./charts/StatTile";
import { BarChart } from "./charts/BarChart";
import { DonutChart } from "./charts/DonutChart";
import { CATEGORICAL_FILL, SEQUENTIAL_BLUE_FILL, STATUS_FILL, MUTED_FILL } from "@/lib/chartColors";

const TAT_FILL: Record<string, string> = {
  on_track: STATUS_FILL.good,
  at_risk: STATUS_FILL.warning,
  breached: STATUS_FILL.critical,
};

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function DashboardView({ metrics }: { metrics: DashboardMetrics }) {
  const avgTimePerStageItems = metrics.avgTimePerStage.map((s) => ({ key: s.key, label: s.label, count: s.days }));
  const recruiterLoadTop = metrics.recruiterLoad.slice(0, 8);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">A live snapshot of the hiring pipeline.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatTile label="Open positions" value={metrics.openPositions} />
        <StatTile label="Active candidates" value={metrics.activeCandidates} />
        <StatTile label="In offer process" value={metrics.inOfferProcess} />
        <StatTile
          label="On hold"
          value={metrics.onHoldCandidates}
          accent={metrics.onHoldCandidates > 0 ? "warning" : undefined}
        />
        <StatTile
          label="TAT breached"
          value={metrics.tatBreached}
          accent={metrics.tatBreached > 0 ? "critical" : undefined}
        />
        <StatTile label="Rejected" value={metrics.rejectedCandidates} />
        <StatTile label="Avg. time to fill" value={metrics.avgTimeToFillDays !== null ? `${metrics.avgTimeToFillDays}d` : "—"} />
        <StatTile
          label="Offer acceptance rate"
          value={metrics.offerAcceptance.ratePercent !== null ? `${metrics.offerAcceptance.ratePercent}%` : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart
          title="Candidates by stage"
          subtitle="Active candidates, sourcing → handover"
          items={metrics.candidatesByStage}
          colorFor={(_item, i) => SEQUENTIAL_BLUE_FILL[Math.min(i, SEQUENTIAL_BLUE_FILL.length - 1)]}
        />

        <DonutChart
          title="Requisition status"
          items={metrics.requisitionStatusBreakdown}
          colorFor={(_item, i) => CATEGORICAL_FILL[i % CATEGORICAL_FILL.length]}
        />

        <DonutChart
          title="TAT status"
          subtitle="Active candidates only"
          items={metrics.tatBreakdown}
          colorFor={(item) => TAT_FILL[item.key] ?? MUTED_FILL}
        />

        <BarChart
          title="Priority breakdown"
          subtitle="Active candidates — recruiter-assigned, P1 highest"
          items={metrics.priorityBreakdown}
          colorFor={(item, i) => (item.key === "none" ? MUTED_FILL : SEQUENTIAL_BLUE_FILL[SEQUENTIAL_BLUE_FILL.length - 1 - i])}
        />

        <BarChart
          title="Requisitions by department"
          items={metrics.departmentBreakdown}
          colorFor={() => CATEGORICAL_FILL[0]}
        />

        <BarChart
          title="Average time per stage"
          subtitle="Days currently spent by active candidates in each stage — spot bottlenecks"
          items={avgTimePerStageItems}
          colorFor={(_item, i) => SEQUENTIAL_BLUE_FILL[Math.min(i, SEQUENTIAL_BLUE_FILL.length - 1)]}
          formatValue={(item) => `${item.count}d`}
        />

        <BarChart
          title="Recruiter load"
          subtitle="Active candidates currently owned, per recruiter"
          items={recruiterLoadTop}
          colorFor={() => CATEGORICAL_FILL[2]}
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
        <StatTile label="Total requisitions" value={metrics.totalRequisitions} />
        <StatTile label="Experienced-track candidates" value={metrics.experiencedCandidates} />
        <StatTile label="Fresher/Intern-track candidates" value={metrics.fresherInternCandidates} />
      </div>
    </div>
  );
}
