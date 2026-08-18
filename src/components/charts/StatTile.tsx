"use client";

import { useEffect, useRef, useState } from "react";
import { STATUS_TEXT } from "@/lib/chartColors";

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8 7.3v4.2" strokeLinecap="round" />
    </svg>
  );
}

// No positioning library available — on hover/tap we measure the trigger's
// position against the viewport and flip the tooltip to whichever edge keeps
// it fully on-screen, since a naive centered tooltip clips at the far ends
// of an 8-column dashboard grid.
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const wrapRef = useRef<HTMLSpanElement>(null);

  function updateAlign() {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const halfTooltip = 116; // half of the ~232px (w-56 + padding) tooltip width
    const center = rect.left + rect.width / 2;
    if (center - halfTooltip < 8) setAlign("left");
    else if (center + halfTooltip > window.innerWidth - 8) setAlign("right");
    else setAlign("center");
  }

  useEffect(() => {
    if (!open) return;
    updateAlign();
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const posClass = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex shrink-0"
      onMouseEnter={() => {
        updateAlign();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => {
          updateAlign();
          setOpen((v) => !v);
        }}
        className="text-slate-400 outline-none transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        aria-label="What does this metric mean?"
      >
        <InfoIcon />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-full z-20 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] font-normal leading-snug text-slate-600 shadow-lg dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 ${posClass}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function StatTile({
  label,
  value,
  accent,
  statusTone,
  description,
  icon,
  tone = "headline",
}: {
  label: string;
  value: number | string;
  /** Escalation: only pass this when the number itself is currently bad — colors the border and value text. */
  accent?: "good" | "warning" | "critical";
  /** Category identity: marks this tile as a risk-type metric via a permanently tinted icon, independent of the current value. */
  statusTone?: "good" | "warning" | "critical";
  description?: string;
  icon?: React.ReactNode;
  /** hero = the 2-3 headline KPIs, headline = plain supporting counts, compact = small/muted secondary row. */
  tone?: "hero" | "headline" | "compact";
}) {
  const borderBase =
    "border-y border-r border-y-slate-200 border-r-slate-200 dark:border-y-slate-700 dark:border-r-slate-700";
  const leftAccent =
    accent === "warning"
      ? "border-l-4 border-l-amber-400 dark:border-l-amber-500"
      : accent === "critical"
        ? "border-l-4 border-l-red-400 dark:border-l-red-500"
        : accent === "good"
          ? "border-l-4 border-l-green-400 dark:border-l-green-500"
          : tone === "compact"
            ? "border-l-2 border-l-slate-300 dark:border-l-slate-600"
            : "border-l-4 border-l-indigo-300 dark:border-l-indigo-800";
  const iconTone = statusTone ?? accent;
  const iconBg =
    iconTone === "warning"
      ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
      : iconTone === "critical"
        ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
        : iconTone === "good"
          ? "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400"
          : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400";
  const iconBoxSize = tone === "hero" ? "h-11 w-11" : tone === "compact" ? "h-8 w-8" : "h-9 w-9";
  const valueSize = tone === "hero" ? "text-4xl" : tone === "compact" ? "text-2xl" : "text-3xl";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl shadow-sm ${borderBase} ${leftAccent} ${
        tone === "hero" ? "bg-indigo-50/60 p-5 dark:bg-indigo-950/20" : "bg-white p-4 dark:bg-slate-800"
      } ${tone === "compact" ? "p-3.5" : ""}`}
    >
      {icon && (
        <div className={`flex ${iconBoxSize} shrink-0 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <div className="line-clamp-2 text-xs font-medium leading-snug text-slate-600 dark:text-slate-300">
            {label}
          </div>
          {description && <InfoTooltip text={description} />}
        </div>
        <div className={`mt-1 font-bold tabular-nums text-slate-900 dark:text-slate-100 ${valueSize} ${accent ? STATUS_TEXT[accent] : ""}`}>
          {value}
        </div>
      </div>
    </div>
  );
}
