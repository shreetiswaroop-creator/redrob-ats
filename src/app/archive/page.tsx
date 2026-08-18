import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";
import { ArchiveViewClientOnly } from "@/components/ArchiveViewClientOnly";
import { CustomFieldDefinition, Requisition } from "@/lib/types";
import { getSessionUserFromCookies } from "@/lib/session-server";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [{ data }, { data: customFieldsData }] = await Promise.all([
    supabase.from("requisitions").select("*").eq("archived", true).order("archived_at", { ascending: false }),
    supabase.from("custom_field_definitions").select("*").eq("entity_type", "candidate").order("display_order", { ascending: true }),
  ]);

  const user = { id: session.sub, name: session.name, email: session.email, role: session.role };

  return (
    <AppShell user={user}>
      <ArchiveViewClientOnly
        initialRequisitions={(data as Requisition[]) ?? []}
        customFieldDefinitions={(customFieldsData as CustomFieldDefinition[]) ?? []}
      />
    </AppShell>
  );
}
