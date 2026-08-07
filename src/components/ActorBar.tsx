"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActor } from "@/lib/actor-context";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { ThemeToggle } from "./ThemeToggle";

export function ActorBar() {
  const { user } = useActor();
  const router = useRouter();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400">
      <div className="truncate text-slate-700 dark:text-slate-300">
        {user?.name}
        <div className="text-slate-400 dark:text-slate-500">
          {user?.role === "hr_management" ? "HR Management" : "Recruiter"}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button onClick={() => setShowChangePassword(true)} className="underline hover:text-slate-700 dark:hover:text-slate-200">
          Change password
        </button>
        <button onClick={handleLogout} disabled={loggingOut} className="underline hover:text-slate-700 dark:hover:text-slate-200">
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
        <ThemeToggle />
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
