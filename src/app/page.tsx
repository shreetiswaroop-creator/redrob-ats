import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { Candidate, Requisition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [reqRes, candRes] = await Promise.all([
    supabase.from("requisitions").select("*"),
    supabase.from("candidates").select("*"),
  ]);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <DashboardView
        requisitions={(reqRes.data as Requisition[]) ?? []}
        candidates={(candRes.data as Candidate[]) ?? []}
        userName={session.name}
        userRole={session.role}
      />
    </AppShell>
  );
}
