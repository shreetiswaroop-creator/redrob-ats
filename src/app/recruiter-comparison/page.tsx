import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { RecruiterComparisonView } from "@/components/RecruiterComparisonView";
import { Candidate, Requisition } from "@/lib/types";
import { computeRecruiterMetrics, DateRangeKey, DATE_RANGE_OPTIONS } from "@/lib/recruiterMetrics";

export const dynamic = "force-dynamic";

export default async function RecruiterComparisonPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  // Hard redirect, not an inline "Restricted" message — this compares every
  // recruiter's individual numbers, so it's gated the same way /settings is:
  // unreachable by URL for non-hr_management, not just hidden from nav.
  if (session.role !== "hr_management") redirect("/");

  const { range: rangeParam } = await searchParams;
  const range: DateRangeKey = DATE_RANGE_OPTIONS.some((o) => o.key === rangeParam) ? (rangeParam as DateRangeKey) : "all";

  const supabase = supabaseServer();
  const [reqRes, candRes] = await Promise.all([
    supabase.from("requisitions").select("*"),
    supabase.from("candidates").select("*"),
  ]);

  const allMetrics = computeRecruiterMetrics((reqRes.data as Requisition[]) ?? [], (candRes.data as Candidate[]) ?? [], range);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <RecruiterComparisonView metrics={allMetrics} range={range} />
    </AppShell>
  );
}
