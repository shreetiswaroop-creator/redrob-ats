"use client";

import { ActorProvider, AuthedUser } from "@/lib/actor-context";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { ChatWidget } from "./ChatWidget";
import { OnboardingTour } from "./OnboardingTour";
import { ApprovalsBell } from "./ApprovalsBell";

export function AppShell({ user, children }: { user: AuthedUser; children: React.ReactNode }) {
  return (
    <ActorProvider user={user}>
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800">
            {user.role === "hr_management" && <ApprovalsBell />}
            <ThemeToggle />
          </header>
          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-auto p-4">{children}</main>
        </div>
      </div>
      <ChatWidget />
      <OnboardingTour />
    </ActorProvider>
  );
}
