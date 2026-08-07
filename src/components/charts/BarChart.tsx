import { CountItem } from "@/lib/dashboardMetrics";

// Horizontal bar chart, plain HTML/CSS (percentage-width bars) — no SVG
// needed for this form. Bars are capped at 24px thick per the mark spec,
// square at the baseline (left) and rounded at the data end (right), and
// every bar is direct-labeled with its value so no tooltip is required to
// read the chart. `colorFor` takes the same fill-* classes as DonutChart's,
// for a single source of truth per color — converted to bg-* here.
export function BarChart({
  items,
  colorFor,
  title,
  subtitle,
  formatValue,
}: {
  items: CountItem[];
  colorFor: (item: CountItem, index: number) => string;
  title: string;
  subtitle?: string;
  formatValue?: (item: CountItem) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {subtitle && <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
      <div className={subtitle ? "space-y-2.5" : "mt-3 space-y-2.5"}>
        {items.map((item, i) => (
          <div key={item.key} className="flex items-center gap-3">
            <div className="w-40 shrink-0 truncate text-xs text-slate-600 dark:text-slate-400" title={item.label}>
              {item.label}
            </div>
            <div className="relative h-6 min-w-0 flex-1 border-l border-slate-200 dark:border-slate-700">
              <div
                className={`h-6 rounded-r-[4px] ${colorFor(item, i).replaceAll("fill-", "bg-")}`}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <div className="w-12 shrink-0 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
              {formatValue ? formatValue(item) : item.count}
            </div>
          </div>
        ))}
        {items.every((i) => i.count === 0) && (
          <p className="text-xs text-slate-400 dark:text-slate-500">No data yet.</p>
        )}
      </div>
    </div>
  );
}
