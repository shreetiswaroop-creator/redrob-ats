import Link from "next/link";
import { DATE_RANGE_OPTIONS, DateRangeKey, RecruiterMetrics } from "@/lib/recruiterMetrics";
import { StatTile } from "./charts/StatTile";
import { BarChart } from "./charts/BarChart";
import { SEQUENTIAL_BLUE } from "@/lib/chartColors";

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function MyPerformanceView({ metrics, range }: { metrics: RecruiterMetrics; range: DateRangeKey }) {
  const avgTimePerStageItems = metrics.avgTimePerStage.map((s) => ({ key: s.key, label: s.label, count: s.days }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">My Performance</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your own recruiting metrics — visible only to you. Period-based figures reflect the selected range; pipeline
            snapshots (active load, time in stage, acceptance/TAT/rejection rates) reflect current state regardless of range.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {DATE_RANGE_OPTIONS.map((o) => (
            <Link
              key={o.key}
              href={`/my-performance?range=${o.key}`}
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

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          tone="hero"
          label="Active pipeline size"
          value={metrics.activePipelineSize}
          description="Your candidates currently Active across every pipeline stage — a live snapshot, not filtered by the selected period."
        />
        <StatTile
          tone="hero"
          label="Requisitions closed"
          value={metrics.requisitionsClosedInPeriod}
          description="Requisitions where the earliest offer-acceptance came from one of your candidates, and that acceptance fell within the selected period."
        />
        <StatTile
          tone="hero"
          label="Avg. time to fill"
          value={metrics.avgTimeToFillDays !== null ? `${metrics.avgTimeToFillDays}d` : "—"}
          description="Average calendar days from requisition creation to offer acceptance, across the requisitions you closed in the selected period."
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          tone="compact"
          label="Sourced"
          value={metrics.candidatesSourcedInPeriod}
          description="Your candidates created within the selected period."
        />
        <StatTile
          tone="compact"
          label="Reached Screening"
          value={metrics.candidatesScreenedInPeriod}
          description="Your candidates who moved into the Screening stage within the selected period."
        />
        <StatTile
          tone="compact"
          label="Offer acceptance"
          value={metrics.offerAcceptance.ratePercent !== null ? `${metrics.offerAcceptance.ratePercent}%` : "—"}
          description="Share of your candidates who ever reached Offer Process or later that went on to accept. Current state, not period-filtered."
        />
        <StatTile
          tone="compact"
          label="Time to first action"
          value={metrics.timeToFirstActionHours !== null ? `${metrics.timeToFirstActionHours}h` : "—"}
          description="Average hours between a candidate's creation and your first logged action on their record, for candidates sourced in the selected period."
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SectionCard title="TAT adherence" subtitle="Your completed offer steps — current state">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {metrics.tatAdherence.adherencePercent !== null ? `${metrics.tatAdherence.adherencePercent}%` : "—"}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {metrics.tatAdherence.onTrackSteps}/{metrics.tatAdherence.completedSteps} completed steps never breached TAT
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Grace extensions you requested in the selected period:{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">{metrics.graceExtensionsRequestedInPeriod}</span>{" "}
            <span className="text-slate-400 dark:text-slate-500">(context, not a penalty)</span>
          </p>
        </SectionCard>

        <SectionCard title="Documentation completeness" subtitle="Starting rubric — current state">
          <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            <li className="flex items-center justify-between">
              <span>Rejected candidates with a reason on file</span>
              <span className="font-medium">
                {metrics.documentationCompleteness.rejectionReasonPercent !== null
                  ? `${metrics.documentationCompleteness.rejectionReasonPercent}%`
                  : "—"}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>Experienced candidates past Step 1 with employment history recorded</span>
              <span className="font-medium">
                {metrics.documentationCompleteness.employmentHistoryPercent !== null
                  ? `${metrics.documentationCompleteness.employmentHistoryPercent}%`
                  : "—"}
              </span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart
          title="Average time per stage"
          subtitle="Days currently spent by your active candidates in each stage"
          items={avgTimePerStageItems}
          colorFor={(_item, i) => SEQUENTIAL_BLUE[Math.min(i, SEQUENTIAL_BLUE.length - 1)]}
          formatValue={(item) => `${item.count}d`}
        />

        <SectionCard title="Rejection rate by stage" subtitle={`${metrics.rejectedTotal} of your candidates rejected, current state`}>
          {metrics.rejectionByStage.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No rejections on record.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {metrics.rejectionByStage.map((r) => (
                <li key={r.key} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                  <span className="truncate">{r.label}</span>
                  <span className="font-medium">
                    {r.count} ({r.percent}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
