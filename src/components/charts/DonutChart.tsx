"use client";

import { CountItem } from "@/lib/dashboardMetrics";
import { ColorSlot, MUTED } from "@/lib/chartColors";

const SIZE = 160;
const RADIUS = 60;
const STROKE = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Hand-rolled SVG donut (stroke-dasharray technique) — part-to-whole with
// <=6 segments, each carrying a <title> for a hover value and a legend swatch
// (never color-only) so identity never rides on hue alone.
export function DonutChart({
  items,
  colorFor,
  title,
  subtitle,
}: {
  items: CountItem[];
  colorFor: (item: CountItem, index: number) => ColorSlot;
  title: string;
  subtitle?: string;
}) {
  const total = items.reduce((sum, i) => sum + i.count, 0);
  let cumulative = 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {total === 0 ? (
              <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className={MUTED.stroke} />
            ) : (
              items
                .filter((item) => item.count > 0)
                .map((item, i) => {
                  const fraction = item.count / total;
                  const dash = fraction * CIRCUMFERENCE;
                  const gap = Math.min(2, dash);
                  const offset = -cumulative * CIRCUMFERENCE;
                  cumulative += fraction;
                  return (
                    <circle
                      key={item.key}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      strokeWidth={STROKE}
                      strokeDasharray={`${dash - gap} ${CIRCUMFERENCE - (dash - gap)}`}
                      strokeDashoffset={offset}
                      className={colorFor(item, i).stroke}
                    >
                      <title>{`${item.label}: ${item.count} (${Math.round(fraction * 100)}%)`}</title>
                    </circle>
                  );
                })
            )}
          </g>
          <text
            x={SIZE / 2}
            y={SIZE / 2 - 4}
            textAnchor="middle"
            className="fill-slate-900 text-xl font-semibold dark:fill-slate-100"
          >
            {total}
          </text>
          <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="fill-slate-400 text-[10px] dark:fill-slate-500">
            total
          </text>
        </svg>
        <ul className="min-w-[140px] flex-1 space-y-1.5">
          {items.map((item, i) => (
            <li key={item.key} className="flex items-center gap-2 text-xs">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${colorFor(item, i).bg}`} />
              <span className="flex-1 truncate text-slate-600 dark:text-slate-400">{item.label}</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{item.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
