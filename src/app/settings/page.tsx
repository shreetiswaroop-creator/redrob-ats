import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { SettingsView } from "@/components/SettingsView";
import { AppUser, CustomFieldDefinition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  // Settings holds the org's Gmail/Calendar connect flow, TAT defaults, and
  // branding — hr_management only, hard redirect rather than an inline
  // "Restricted" message so the surface area isn't even reachable by URL.
  if (session.role !== "hr_management") redirect("/");

  const user = { id: session.sub, name: session.name, email: session.email, role: session.role };

  const supabase = supabaseServer();
  const [
    { data: usersData },
    { count: demoCandidateCount },
    { count: demoRequisitionCount },
    { data: customFieldsData },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, created_at, created_by, gmail_email, gmail_connected_at, deactivated_at")
      .order("created_at", { ascending: true }),
    supabase.from("candidates").select("id", { count: "exact", head: true }).eq("is_demo", true),
    supabase.from("requisitions").select("id", { count: "exact", head: true }).eq("is_demo", true),
    supabase.from("custom_field_definitions").select("*").order("display_order", { ascending: true }),
  ]);

  return (
    <AppShell user={user}>
      <SettingsView
        initialUsers={(usersData as AppUser[]) ?? []}
        currentUserId={session.sub}
        initialDemoCount={(demoCandidateCount ?? 0) + (demoRequisitionCount ?? 0)}
        initialCustomFields={(customFieldsData as CustomFieldDefinition[]) ?? []}
      />
    </AppShell>
  );
}
