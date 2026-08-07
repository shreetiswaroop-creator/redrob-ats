import { STATUS_TEXT } from "@/lib/chartColors";

export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "good" | "warning" | "critical";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ? STATUS_TEXT[accent] : "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}
