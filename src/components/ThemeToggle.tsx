"use client";

import { useTheme } from "@/lib/theme-context";

function SunIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="3" fill="#f59e0b" />
      <g stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round">
        <path d="M7 0.5v1.6" />
        <path d="M7 11.9v1.6" />
        <path d="M13.5 7h-1.6" />
        <path d="M2.1 7H0.5" />
        <path d="M11.5 2.5l-1.1 1.1" />
        <path d="M3.6 10.4l-1.1 1.1" />
        <path d="M11.5 11.5l-1.1-1.1" />
        <path d="M3.6 3.6l-1.1-1.1" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M12.5 8.8A5.8 5.8 0 0 1 5.2 1.5a5.8 5.8 0 1 0 7.3 7.3Z" fill="#e0e7ff" />
    </svg>
  );
}

// iOS-style sliding switch: sun/moon fixed at either end of the track, a
// white knob slides over whichever side matches the current theme.
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative inline-flex h-6 w-12 shrink-0 items-center rounded-full transition-colors ${
        isDark ? "bg-indigo-600" : "bg-slate-300"
      }`}
    >
      <span className="absolute left-1 flex items-center">
        <SunIcon />
      </span>
      <span className="absolute right-1 flex items-center">
        <MoonIcon />
      </span>
      <span
        className={`relative z-10 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          isDark ? "translate-x-[26px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
