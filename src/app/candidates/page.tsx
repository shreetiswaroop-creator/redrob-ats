import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { CandidatesView } from "@/components/CandidatesView";
import { CustomFieldDefinition, Requisition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [{ data }, { data: customFieldsData }] = await Promise.all([
    supabase.from("requisitions").select("*"),
    supabase.from("custom_field_definitions").select("*").eq("entity_type", "candidate").order("display_order", { ascending: true }),
  ]);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <CandidatesView
        requisitions={(data as Requisition[]) ?? []}
        customFieldDefinitions={(customFieldsData as CustomFieldDefinition[]) ?? []}
      />
    </AppShell>
  );
}
