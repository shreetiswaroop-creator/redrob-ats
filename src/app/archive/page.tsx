import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";
import { ArchiveViewClientOnly } from "@/components/ArchiveViewClientOnly";
import { Candidate, CustomFieldDefinition, Requisition } from "@/lib/types";
import { getSessionUserFromCookies } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [{ data }, { data: customFieldsData }, { data: standaloneData }] = await Promise.all([
    supabase.from("requisitions").select("*").eq("archived", true).order("archived_at", { ascending: false }),
    supabase.from("custom_field_definitions").select("*").eq("entity_type", "candidate").order("display_order", { ascending: true }),
    // Candidates archived on their own 15-day on-hold clock (candidate_on_hold_timeout)
    // never touch their requisition's archived flag, so they'd otherwise be
    // unreachable here — the rest of this page is browsed by archived requisition.
    supabase
      .from("candidates")
      .select("*, requisition:requisitions!inner(*)")
      .eq("archived", true)
      .eq("requisition.archived", false)
      .order("archived_at", { ascending: false }),
  ]);

  const user = { id: session.sub, name: session.name, email: session.email, role: session.role };

  return (
    <AppShell user={user}>
      <ArchiveViewClientOnly
        initialRequisitions={(data as Requisition[]) ?? []}
        customFieldDefinitions={(customFieldsData as CustomFieldDefinition[]) ?? []}
        initialStandaloneCandidates={(standaloneData as (Candidate & { requisition: Requisition })[]) ?? []}
      />
    </AppShell>
  );
}
