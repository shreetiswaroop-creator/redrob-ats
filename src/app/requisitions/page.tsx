import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { RequisitionsView } from "@/components/RequisitionsView";
import { CustomFieldDefinition, Requisition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RequisitionsPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  const supabase = supabaseServer();
  const [{ data }, { data: customFieldsData }] = await Promise.all([
    supabase.from("requisitions").select("*, client:clients(name)").order("created_at", { ascending: false }),
    supabase.from("custom_field_definitions").select("*").eq("entity_type", "requisition").order("display_order", { ascending: true }),
  ]);

  return (
    <AppShell user={{ id: session.sub, name: session.name, email: session.email, role: session.role }}>
      <RequisitionsView
        initialRequisitions={(data as Requisition[]) ?? []}
        customFieldDefinitions={(customFieldsData as CustomFieldDefinition[]) ?? []}
      />
    </AppShell>
  );
}
