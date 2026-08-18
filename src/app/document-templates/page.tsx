import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { DocumentTemplatesView } from "@/components/DocumentTemplatesView";
import { DocumentTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DocumentTemplatesPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  // Controls the actual documents generated and sent for every candidate's
  // reference check / HR BGV — hr_management only, hard redirect rather than
  // an inline "Restricted" message so the surface area isn't even reachable
  // by URL (same pattern as Settings — see src/app/settings/page.tsx).
  if (session.role !== "hr_management") redirect("/");

  const user = { id: session.sub, name: session.name, email: session.email, role: session.role };

  const supabase = supabaseServer();
  const { data: templatesData } = await supabase.from("document_templates").select("*").order("label", { ascending: true });

  return (
    <AppShell user={user}>
      <DocumentTemplatesView initialTemplates={(templatesData as DocumentTemplate[]) ?? []} />
    </AppShell>
  );
}
