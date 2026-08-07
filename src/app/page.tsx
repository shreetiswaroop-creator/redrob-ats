import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { BoardAppClientOnly } from "@/components/BoardAppClientOnly";
import { AppShell } from "@/components/AppShell";
import { Requisition, Candidate, OrgSettings, PendingEmailInfo } from "@/lib/types";
import { EMPTY_ORG_SETTINGS, processDuePendingNotifications, sweepStepTatBreaches } from "@/lib/notifications";
import { getSessionUserFromCookies } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  let requisitions: Requisition[] = [];
  let candidates: Candidate[] = [];
  let configError: string | null = null;
  const pendingEmailByCandidate: Record<string, PendingEmailInfo> = {};

  try {
    const supabase = supabaseServer();
    const [reqRes, candRes, orgRes] = await Promise.all([
      supabase.from("requisitions").select("*").order("created_at", { ascending: false }),
      supabase.from("candidates").select("*").order("created_at", { ascending: false }),
      supabase.from("org_settings").select("*").eq("id", "default").single(),
    ]);
    if (reqRes.error) throw new Error(reqRes.error.message);
    if (candRes.error) throw new Error(candRes.error.message);
    requisitions = reqRes.data ?? [];
    candidates = candRes.data ?? [];
    const org = (orgRes.data as OrgSettings) ?? EMPTY_ORG_SETTINGS;

    const requisitionById = new Map(requisitions.map((r) => [r.id, r]));
    await sweepStepTatBreaches(supabase, candidates, requisitionById, org);
    // Best-effort fallback alongside the external scheduler (task: set up
    // free external scheduler) — resolves due emails whenever someone
    // loads the board too, so testing isn't blocked on that being set up.
    await processDuePendingNotifications(supabase);

    const candRes2 = await supabase.from("candidates").select("*").order("created_at", { ascending: false });
    if (!candRes2.error) candidates = candRes2.data ?? [];

    const { data: pendingRows } = await supabase
      .from("notifications")
      .select("id, candidate_id, subject, scheduled_send_at, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    for (const row of pendingRows ?? []) {
      if (row.candidate_id && !pendingEmailByCandidate[row.candidate_id]) {
        pendingEmailByCandidate[row.candidate_id] = {
          id: row.id,
          subject: row.subject,
          scheduled_send_at: row.scheduled_send_at,
        };
      }
    }
  } catch (err) {
    configError = err instanceof Error ? err.message : "Unknown error";
  }

  const user = { id: session.sub, name: session.name, email: session.email, role: session.role };

  if (configError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-900">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <h1 className="mb-2 font-semibold">Database not connected yet</h1>
          <p className="mb-2">
            The app can&apos;t reach Supabase. Make sure <code>SUPABASE_URL</code> and{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> are set in <code>.env.local</code>, and that the schema in{" "}
            <code>supabase/schema.sql</code> has been run.
          </p>
          <p className="font-mono text-xs text-amber-700 dark:text-amber-400">{configError}</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell user={user}>
      <BoardAppClientOnly
        initialRequisitions={requisitions}
        initialCandidates={candidates}
        pendingEmailByCandidate={pendingEmailByCandidate}
      />
    </AppShell>
  );
}
