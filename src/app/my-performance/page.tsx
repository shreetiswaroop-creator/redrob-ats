import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { MyPerformanceView } from "@/components/MyPerformanceView";
import { Candidate, Requisition } from "@/lib/types";
import { computeRecruiterMetrics, DateRangeKey, DATE_RANGE_OPTIONS, emptyRecruiterMetrics } from "@/lib/recruiterMetrics";

export const dynamic = "force-dynamic";

export default async function MyPerformancePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const { range: rangeParam } = await searchParams;
  const range: DateRangeKey = DATE_RANGE_OPTIONS.some((o) => o.key === rangeParam) ? (rangeParam as DateRangeKey) : "all";

  const supabase = supabaseServer();
  const [reqRes, candRes] = await Promise.all([
    supabase.from("requisitions").select("*"),
    supabase.from("candidates").select("*"),
  ]);

  // Computed for every recruiter server-side (attribution for "closed"
  // requisitions needs visibility into everyone's candidates), but only
  // the signed-in user's own row is ever selected out and sent to the
  // client below — no other recruiter's data leaves this function.
  const allMetrics = computeRecruiterMetrics((reqRes.data as Requisition[]) ?? [], (candRes.data as Candidate[]) ?? [], range);
  const myMetrics = allMetrics.find((m) => m.owner === session.name) ?? emptyRecruiterMetrics(session.name);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <MyPerformanceView metrics={myMetrics} range={range} />
    </AppShell>
  );
}
