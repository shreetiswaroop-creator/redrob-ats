"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActor } from "@/lib/actor-context";
import { UserRole } from "@/lib/types";
import { RedrobLogo } from "./RedrobLogo";
import { ActorBar } from "./ActorBar";

function PipelineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="1.5" y="2.5" width="4" height="13" rx="1" />
      <rect x="7" y="2.5" width="4" height="8" rx="1" />
      <rect x="12.5" y="2.5" width="4" height="10.5" rx="1" />
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

const NAV_ITEMS: { href: string; label: string; icon: () => React.JSX.Element; roles: UserRole[] | null }[] = [
  { href: "/", label: "Dashboard", icon: DashboardIcon, roles: null },
  { href: "/pipeline", label: "Candidate Pipeline", icon: PipelineIcon, roles: null },
  { href: "/candidates", label: "Candidates", icon: UserPlusIcon, roles: null },
  { href: "/interviews", label: "Interviews", icon: CalendarIcon, roles: null },
  { href: "/archive", label: "Archive", icon: ArchiveIcon, roles: null },
  { href: "/notifications", label: "Notifications log", icon: BellIcon, roles: null },
  { href: "/my-performance", label: "My Performance", icon: TargetIcon, roles: null },
  { href: "/recruiter-comparison", label: "Recruiter Comparison", icon: ScaleIcon, roles: ["hr_management"] },
  { href: "/document-templates", label: "Document Templates", icon: DocumentTemplatesIcon, roles: ["hr_management"] },
  { href: "/settings", label: "Settings", icon: SettingsIcon, roles: ["hr_management"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useActor();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-700">
        <RedrobLogo size="lg" />
        <p className="mt-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">Applicant Tracking System</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <Icon />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3 dark:border-slate-700">
        <ActorBar />
      </div>
    </aside>
  );
}
