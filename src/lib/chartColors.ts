// Validated categorical/status/sequential palette (dataviz skill) as Tailwind
// arbitrary-value classes, so charts follow the same CSS-only dark mode
// convention as the rest of the app (no JS theme detection needed). Each
// pair below is a *fixed* light/dark hex step from the skill's palette.md —
// never eyeball a chart color, only use a slot from here.

// 8-hue categorical order — fixed, never cycled or re-ordered per chart.
export const CATEGORICAL_FILL = [
  "fill-[#2a78d6] dark:fill-[#3987e5]", // 1 blue
  "fill-[#eb6834] dark:fill-[#d95926]", // 2 orange
  "fill-[#1baf7a] dark:fill-[#199e70]", // 3 aqua
  "fill-[#eda100] dark:fill-[#c98500]", // 4 yellow
  "fill-[#e87ba4] dark:fill-[#d55181]", // 5 magenta
  "fill-[#008300] dark:fill-[#008300]", // 6 green
  "fill-[#4a3aa7] dark:fill-[#9085e9]", // 7 violet
  "fill-[#e34948] dark:fill-[#e66767]", // 8 red
] as const;

export const CATEGORICAL_BG = [
  "bg-[#2a78d6] dark:bg-[#3987e5]",
  "bg-[#eb6834] dark:bg-[#d95926]",
  "bg-[#1baf7a] dark:bg-[#199e70]",
  "bg-[#eda100] dark:bg-[#c98500]",
  "bg-[#e87ba4] dark:bg-[#d55181]",
  "bg-[#008300] dark:bg-[#008300]",
  "bg-[#4a3aa7] dark:bg-[#9085e9]",
  "bg-[#e34948] dark:bg-[#e66767]",
] as const;

// Status is a small fixed scale, reserved meaning — never reused as "series N".
export const STATUS_FILL = {
  good: "fill-[#0ca30c]",
  warning: "fill-[#fab219]",
  serious: "fill-[#ec835a]",
  critical: "fill-[#d03b3b]",
} as const;

export const STATUS_BG = {
  good: "bg-[#0ca30c]",
  warning: "bg-[#fab219]",
  serious: "bg-[#ec835a]",
  critical: "bg-[#d03b3b]",
} as const;

export const STATUS_TEXT = {
  good: "text-[#0ca30c] dark:text-[#0ca30c]",
  warning: "text-[#b5790f] dark:text-[#fab219]",
  serious: "text-[#ec835a] dark:text-[#ec835a]",
  critical: "text-[#d03b3b] dark:text-[#e66767]",
} as const;

// Sequential blue ramp, light -> dark, for ordinal data (funnel stages,
// priority tiers) where lightness itself carries order.
export const SEQUENTIAL_BLUE_FILL = [
  "fill-[#9ec5f4] dark:fill-[#184f95]", // step 200 (lightest)
  "fill-[#6da7ec] dark:fill-[#256abf]", // step 300
  "fill-[#3987e5] dark:fill-[#3987e5]", // step 400
  "fill-[#2a78d6] dark:fill-[#5598e7]", // step 450
  "fill-[#1c5cab] dark:fill-[#86b6ef]", // step 550 (darkest)
] as const;

export const MUTED_FILL = "fill-slate-300 dark:fill-slate-600";
export const MUTED_BG = "bg-slate-300 dark:bg-slate-600";

export const AXIS_TEXT = "fill-slate-500 dark:fill-slate-400";
export const GRID_STROKE = "stroke-slate-200 dark:stroke-slate-700";
