"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActor } from "@/lib/actor-context";
import { UserRole } from "@/lib/types";
import { RedrobLogo } from "./RedrobLogo";
import { ActorBar } from "./ActorBar";

const COLLAPSE_STORAGE_KEY = "ats_sidebar_collapsed";

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 2.5 3.5 6l4 3.5" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="1.5" y="2.5" width="4" height="13" rx="1" />
      <rect x="7" y="2.5" width="4" height="8" rx="1" />
      <rect x="12.5" y="2.5" width="4" height="10.5" rx="1" />
    </svg>
  );
}

function RequisitionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="14" height="10" rx="1.5" />
      <path d="M6.5 5V3.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5" />
      <path d="M2 9.5h14" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="5.5" r="2.5" />
      <path d="M1.5 15.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <path d="M14 5.5v4" />
      <path d="M12 7.5h4" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="1.5" y="1.5" width="6.5" height="6.5" rx="1" />
      <rect x="10" y="1.5" width="6.5" height="4" rx="1" />
      <rect x="10" y="7.5" width="6.5" height="9" rx="1" />
      <rect x="1.5" y="10" width="6.5" height="6.5" rx="1" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 7a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5h-13S4 11 4 7Z" />
      <path d="M7.5 15a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function ApprovalsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 2.5h7a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h1" />
      <rect x="6.5" y="1.5" width="5" height="2.5" rx="0.7" />
      <path d="M6 10.5l1.8 1.8L12.5 8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="1.5" y="3" width="15" height="13" rx="1.5" />
      <path d="M1.5 7h15" />
      <path d="M5 1.5v3" />
      <path d="M13 1.5v3" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2" width="15" height="4" rx="1" />
      <path d="M2.5 6v8.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V6" />
      <path d="M7 9.5h4" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="9" r="7" />
      <circle cx="9" cy="9" r="4" />
      <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v14" />
      <path d="M4.5 4.5h9" />
      <path d="M2 4.5l2.5 5h-5z" />
      <path d="M13.5 4.5l2.5 5h-5z" />
      <path d="M6 16h6" />
    </svg>
  );
}

function EmailTemplatesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3.5" width="15" height="11" rx="1.5" />
      <path d="M2 4.5l7 5.5 7-5.5" />
    </svg>
  );
}

function DocumentTemplatesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 1.5h6l3 3v11a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" />
      <path d="M10.5 1.5v3h3" />
      <path d="M6 9.5h6M6 12h6M6 7h3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 1.8v2.1M9 14.1v2.1M16.2 9h-2.1M3.9 9H1.8M14.1 3.9l-1.5 1.5M5.4 12.6l-1.5 1.5M14.1 14.1l-1.5-1.5M5.4 5.4L3.9 3.9" />
    </svg>
  );
}

// Single source of truth for both the sidebar's hover tooltips and the
// onboarding tour's step content (OnboardingTour.tsx) — one description per
// nav item, written once instead of duplicated between the two.
//
// Ordered by actual workflow sequence rather than build order: Candidates
// (where you add someone) comes before Candidate Pipeline (where you track
// them); Notifications log sits at the end of the regular list since it's a
// log checked occasionally, not a daily page; Settings stays last as the one
// purely administrative item.
export const NAV_ITEMS: {
  href: string;
  label: string;
  icon: () => React.JSX.Element;
  roles: UserRole[] | null;
  description: string;
}[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: DashboardIcon,
    roles: null,
    description: "A live snapshot of your hiring pipeline — key metrics, charts, and what needs attention.",
  },
  {
    href: "/approvals",
    label: "Approvals",
    icon: ApprovalsIcon,
    roles: ["hr_management"],
    description: "Everything waiting on HR Management in one place — requisition approvals, reference exceptions, grace extensions, and offer document reviews.",
  },
  {
    href: "/requisitions",
    label: "Requisitions",
    icon: RequisitionsIcon,
    roles: null,
    description: "Raise a new requisition, attach a JD, and see every requisition raised so far.",
  },
  {
    href: "/candidates",
    label: "Candidates",
    icon: UserPlusIcon,
    roles: null,
    description: "Shortlist a new candidate against an open requisition.",
  },
  {
    href: "/pipeline",
    label: "Candidate Pipeline",
    icon: PipelineIcon,
    roles: null,
    description: "The board where requisitions and candidates move through every stage, from Sourcing to Handover.",
  },
  {
    href: "/interviews",
    label: "Interviews",
    icon: CalendarIcon,
    roles: null,
    description: "Schedule interviews and see the week's calendar across all panelists.",
  },
  {
    href: "/archive",
    label: "Archive",
    icon: ArchiveIcon,
    roles: null,
    description: "Positions and candidates that are fulfilled, expired, or closed.",
  },
  {
    href: "/my-performance",
    label: "My Performance",
    icon: TargetIcon,
    roles: null,
    description: "Your own recruiting metrics — pipeline, time-to-fill, offer acceptance, and more.",
  },
  {
    href: "/recruiter-comparison",
    label: "Recruiter Comparison",
    icon: ScaleIcon,
    roles: ["hr_management"],
    description: "Compare every recruiter's metrics side by side.",
  },
  {
    href: "/email-templates",
    label: "Email Templates",
    icon: EmailTemplatesIcon,
    roles: ["hr_management"],
    description: "Edit the wording of every candidate and internal email the system sends.",
  },
  {
    href: "/document-templates",
    label: "Document Templates",
    icon: DocumentTemplatesIcon,
    roles: ["hr_management"],
    description: "Edit the Reference Check and HR Background Verification documents sent out to candidates.",
  },
  {
    href: "/notifications",
    label: "Notifications log",
    icon: BellIcon,
    roles: null,
    description: "Every email the system has sent or queued, and why.",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    roles: ["hr_management"],
    description: "Org-wide configuration — accounts, contacts, TAT defaults, branding, templates, and custom fields.",
  },
];

// Standalone avatar + click-to-open popover shown in place of the full
// ActorBar when the rail is collapsed — reuses ActorBar unmodified rather
// than duplicating its gmail-status/change-password/logout logic.
function CollapsedUserBlock() {
  const { user } = useActor();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <div ref={wrapRef} className="relative flex justify-center" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={user?.name}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white dark:bg-indigo-500"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute bottom-0 left-full z-20 ml-2 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-700">
          <ActorBar />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useActor();
  const [collapsed, setCollapsed] = useState(false);

  // Read the persisted preference after mount (not in a lazy useState
  // initializer) so the server-rendered/first-paint markup always matches —
  // avoids a React hydration mismatch at the cost of one quick post-mount
  // re-render, same tradeoff already accepted for dark mode elsewhere in
  // this app.
  useEffect(() => {
    if (window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={`relative flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out dark:border-slate-700 dark:bg-slate-800 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <span className={`flex transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}>
          <ChevronIcon />
        </span>
      </button>

      <div className={`border-b border-slate-100 py-4 dark:border-slate-700 ${collapsed ? "flex justify-center px-2" : "px-4"}`}>
        {collapsed ? (
          <RedrobLogo variant="icon" />
        ) : (
          <>
            <RedrobLogo size="lg" />
            <p className="mt-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">Applicant Tracking System</p>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3">
        {NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.href}
              title={item.description}
              className={`flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-0" : "px-3"
              } ${
                active
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <Icon />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className={`border-t border-slate-100 p-3 dark:border-slate-700 ${collapsed ? "flex justify-center" : ""}`}>
        {collapsed ? <CollapsedUserBlock /> : <ActorBar />}
      </div>
    </aside>
  );
}
