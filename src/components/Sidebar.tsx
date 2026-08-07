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

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6.5" cy="5.5" r="2.5" />
      <path d="M1.5 15.5c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <circle cx="13" cy="5.8" r="2" />
      <path d="M11.8 10.7c2.3.3 4.2 2.3 4.2 4.8" />
    </svg>
  );
}

const NAV_ITEMS: { href: string; label: string; icon: () => React.JSX.Element; roles: UserRole[] | null }[] = [
  { href: "/", label: "Candidate Pipeline", icon: PipelineIcon, roles: null },
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon, roles: null },
  { href: "/notifications", label: "Notifications log", icon: BellIcon, roles: null },
  { href: "/accounts", label: "Accounts", icon: PeopleIcon, roles: ["hr_management"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useActor();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-700">
        <RedrobLogo />
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
