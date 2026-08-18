// Validated categorical/status/sequential palette (dataviz skill), expressed
// as fully-literal Tailwind classes per usage context (fill / stroke / bg).
//
// IMPORTANT: Tailwind's JIT scanner only generates CSS for arbitrary-value
// classes (e.g. bg-[#60a5fa]) that appear as literal strings somewhere in
// scanned source — it can't see classes assembled at runtime via string
// concatenation or .replace(). Every variant a component might render must
// therefore be written out literally below, once, rather than derived from
// another variant at runtime (that silently produces classes Tailwind never
// generated any CSS for, which render with zero visual effect).
export interface ColorSlot {
  fill: string;
  stroke: string;
  bg: string;
}

// 8-hue categorical order — fixed, never cycled or re-ordered per chart.
export const CATEGORICAL: ColorSlot[] = [
  { fill: "fill-[#2a78d6] dark:fill-[#3987e5]", stroke: "stroke-[#2a78d6] dark:stroke-[#3987e5]", bg: "bg-[#2a78d6] dark:bg-[#3987e5]" }, // 1 blue
  { fill: "fill-[#eb6834] dark:fill-[#d95926]", stroke: "stroke-[#eb6834] dark:stroke-[#d95926]", bg: "bg-[#eb6834] dark:bg-[#d95926]" }, // 2 orange
  { fill: "fill-[#1baf7a] dark:fill-[#199e70]", stroke: "stroke-[#1baf7a] dark:stroke-[#199e70]", bg: "bg-[#1baf7a] dark:bg-[#199e70]" }, // 3 aqua
  { fill: "fill-[#eda100] dark:fill-[#c98500]", stroke: "stroke-[#eda100] dark:stroke-[#c98500]", bg: "bg-[#eda100] dark:bg-[#c98500]" }, // 4 yellow
  { fill: "fill-[#e87ba4] dark:fill-[#d55181]", stroke: "stroke-[#e87ba4] dark:stroke-[#d55181]", bg: "bg-[#e87ba4] dark:bg-[#d55181]" }, // 5 magenta
  { fill: "fill-[#008300] dark:fill-[#008300]", stroke: "stroke-[#008300] dark:stroke-[#008300]", bg: "bg-[#008300] dark:bg-[#008300]" }, // 6 green
  { fill: "fill-[#4a3aa7] dark:fill-[#9085e9]", stroke: "stroke-[#4a3aa7] dark:stroke-[#9085e9]", bg: "bg-[#4a3aa7] dark:bg-[#9085e9]" }, // 7 violet
  { fill: "fill-[#e34948] dark:fill-[#e66767]", stroke: "stroke-[#e34948] dark:stroke-[#e66767]", bg: "bg-[#e34948] dark:bg-[#e66767]" }, // 8 red
];

// Status is a small fixed scale, reserved meaning — never reused as "series N".
export const STATUS: Record<"good" | "warning" | "serious" | "critical", ColorSlot> = {
  good: { fill: "fill-[#0ca30c]", stroke: "stroke-[#0ca30c]", bg: "bg-[#0ca30c]" },
  warning: { fill: "fill-[#fab219]", stroke: "stroke-[#fab219]", bg: "bg-[#fab219]" },
  serious: { fill: "fill-[#ec835a]", stroke: "stroke-[#ec835a]", bg: "bg-[#ec835a]" },
  critical: { fill: "fill-[#d03b3b]", stroke: "stroke-[#d03b3b]", bg: "bg-[#d03b3b]" },
};

export const STATUS_TEXT = {
  good: "text-[#0ca30c] dark:text-[#0ca30c]",
  warning: "text-[#b5790f] dark:text-[#fab219]",
  serious: "text-[#ec835a] dark:text-[#ec835a]",
  critical: "text-[#d03b3b] dark:text-[#e66767]",
} as const;

// Sequential blue ramp for ordinal data (funnel stages, priority tiers) —
// each pair calibrated against this app's ACTUAL card surfaces (white /
// slate-800), not a generic reference surface, and flips lightness anchor
// between modes so every step stays visible against its own surface.
export const SEQUENTIAL_BLUE: ColorSlot[] = [
  { fill: "fill-[#60a5fa] dark:fill-[#1d4ed8]", stroke: "stroke-[#60a5fa] dark:stroke-[#1d4ed8]", bg: "bg-[#60a5fa] dark:bg-[#1d4ed8]" },
  { fill: "fill-[#3b82f6] dark:fill-[#2563eb]", stroke: "stroke-[#3b82f6] dark:stroke-[#2563eb]", bg: "bg-[#3b82f6] dark:bg-[#2563eb]" },
  { fill: "fill-[#2563eb] dark:fill-[#3b82f6]", stroke: "stroke-[#2563eb] dark:stroke-[#3b82f6]", bg: "bg-[#2563eb] dark:bg-[#3b82f6]" },
  { fill: "fill-[#1d4ed8] dark:fill-[#60a5fa]", stroke: "stroke-[#1d4ed8] dark:stroke-[#60a5fa]", bg: "bg-[#1d4ed8] dark:bg-[#60a5fa]" },
  { fill: "fill-[#1e40af] dark:fill-[#93c5fd]", stroke: "stroke-[#1e40af] dark:stroke-[#93c5fd]", bg: "bg-[#1e40af] dark:bg-[#93c5fd]" },
];

export const MUTED: ColorSlot = {
  fill: "fill-slate-300 dark:fill-slate-600",
  stroke: "stroke-slate-300 dark:stroke-slate-600",
  bg: "bg-slate-300 dark:bg-slate-600",
};
