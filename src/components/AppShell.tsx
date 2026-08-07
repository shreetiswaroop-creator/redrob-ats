"use client";

import { ActorProvider, AuthedUser } from "@/lib/actor-context";
import { Sidebar } from "./Sidebar";

export function AppShell({ user, children }: { user: AuthedUser; children: React.ReactNode }) {
  return (
    <ActorProvider user={user}>
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-auto p-4">{children}</main>
      </div>
    </ActorProvider>
  );
}
