import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { ApprovalsView } from "@/components/ApprovalsView";
import { Candidate, Requisition } from "@/lib/types";
import { computePendingApprovals } from "@/lib/pendingApprovals";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");
  // Hard redirect, not just a hidden nav item — this is the same
  // HR-management-only data the API route already gates (reference
  // exceptions, TAT grace requests, offer document drafts).
  if (session.role !== "hr_management") redirect("/");

  const supabase = supabaseServer();
  const [reqRes, candRes] = await Promise.all([
    supabase.from("requisitions").select("*").eq("archived", false),
    supabase.from("candidates").select("*").eq("archived", false),
  ]);

  const items = computePendingApprovals((reqRes.data as Requisition[]) ?? [], (candRes.data as Candidate[]) ?? []);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <ApprovalsView items={items} />
    </AppShell>
  );
}
