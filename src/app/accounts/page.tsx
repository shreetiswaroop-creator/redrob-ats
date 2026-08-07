import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AccountsViewClientOnly } from "@/components/AccountsViewClientOnly";
import { AppShell } from "@/components/AppShell";
import { AppUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const user = { id: session.sub, name: session.name, email: session.email, role: session.role };

  if (session.role !== "hr_management") {
    return (
      <AppShell user={user}>
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <h1 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">Restricted</h1>
          <p>Only HR Management accounts can manage recruiter/HR accounts.</p>
        </div>
      </AppShell>
    );
  }

  const supabase = supabaseServer();
  const [{ data }, { count: demoCandidateCount }, { count: demoRequisitionCount }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, created_at, created_by, gmail_email, gmail_connected_at")
      .order("created_at", { ascending: true }),
    supabase.from("candidates").select("id", { count: "exact", head: true }).eq("is_demo", true),
    supabase.from("requisitions").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);

  return (
    <AppShell user={user}>
      <AccountsViewClientOnly
        initialUsers={(data as AppUser[]) ?? []}
        currentUserId={session.sub}
        initialDemoCount={(demoCandidateCount ?? 0) + (demoRequisitionCount ?? 0)}
      />
    </AppShell>
  );
}
