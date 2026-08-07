import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { computeDashboardMetrics } from "@/lib/dashboardMetrics";
import { Candidate, Requisition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [reqRes, candRes] = await Promise.all([
    supabase.from("requisitions").select("*"),
    supabase.from("candidates").select("*"),
  ]);

  const metrics = computeDashboardMetrics((reqRes.data as Requisition[]) ?? [], (candRes.data as Candidate[]) ?? []);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <DashboardView metrics={metrics} />
    </AppShell>
  );
}
