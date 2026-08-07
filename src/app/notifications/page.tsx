import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { NotificationsLogViewClientOnly } from "@/components/NotificationsLogViewClientOnly";
import { AppShell } from "@/components/AppShell";
import { Candidate, NotificationLogEntry, Requisition } from "@/lib/types";
import { getSessionUserFromCookies } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [notifRes, reqRes, candRes] = await Promise.all([
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("requisitions").select("*"),
    supabase.from("candidates").select("*"),
  ]);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <NotificationsLogViewClientOnly
        initialNotifications={(notifRes.data as NotificationLogEntry[]) ?? []}
        requisitions={(reqRes.data as Requisition[]) ?? []}
        candidates={(candRes.data as Candidate[]) ?? []}
      />
    </AppShell>
  );
}
