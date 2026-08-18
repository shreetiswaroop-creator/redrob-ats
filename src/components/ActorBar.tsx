"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActor } from "@/lib/actor-context";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { REPLAY_TOUR_EVENT } from "./OnboardingTour";

export function ActorBar() {
  const { user } = useActor();
  const router = useRouter();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/me/gmail-status")
      .then((r) => r.json())
      .then(setGmailStatus)
      .catch(() => {});
  }, []);

  async function handleDisconnectGmail() {
    setDisconnecting(true);
    try {
      await fetch("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "personal" }),
      });
      setGmailStatus({ connected: false, email: null });
    } finally {
      setDisconnecting(false);
    }
  }

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
        <button
          onClick={() => window.dispatchEvent(new CustomEvent(REPLAY_TOUR_EVENT))}
          className="underline hover:text-slate-700 dark:hover:text-slate-200"
        >
          Replay tour
        </button>
      </div>

      {gmailStatus && (
        <div className="border-t border-slate-100 pt-2 dark:border-slate-700">
          {gmailStatus.connected ? (
            <>
              <p className="truncate text-emerald-600 dark:text-emerald-400" title={gmailStatus.email ?? undefined}>
                ✓ Gmail &amp; Calendar connected
              </p>
              <button onClick={handleDisconnectGmail} disabled={disconnecting} className="underline hover:text-slate-700 dark:hover:text-slate-200">
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <a href="/api/auth/google/connect?target=personal" className="underline hover:text-slate-700 dark:hover:text-slate-200">
              Connect Gmail &amp; Calendar
            </a>
          )}
        </div>
      )}

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
