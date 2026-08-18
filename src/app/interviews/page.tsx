import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { InterviewsView } from "@/components/InterviewsView";
import { AppUser, Candidate, Interview, Panelist, Requisition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InterviewsPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [reqRes, candRes, userRes, panelistRes, interviewRes] = await Promise.all([
    supabase.from("requisitions").select("*"),
    supabase.from("candidates").select("*"),
    // Every recruiter/HR user can schedule interviews and pick any panelist,
    // so this fetches the full user list directly — /api/users itself is
    // restricted to hr_management (the Accounts page), which would be wrong
    // here.
    supabase.from("users").select("id, name, email, role").order("name", { ascending: true }),
    supabase.from("panelists").select("*").order("name", { ascending: true }),
    supabase.from("interviews").select("*").order("scheduled_at", { ascending: true }),
  ]);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <InterviewsView
        requisitions={(reqRes.data as Requisition[]) ?? []}
        candidates={(candRes.data as Candidate[]) ?? []}
        users={(userRes.data as Pick<AppUser, "id" | "name" | "email" | "role">[]) ?? []}
        initialPanelists={(panelistRes.data as Panelist[]) ?? []}
        initialInterviews={(interviewRes.data as Interview[]) ?? []}
      />
    </AppShell>
  );
}
