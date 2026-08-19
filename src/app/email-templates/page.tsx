import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { AppShell } from "@/components/AppShell";
import { EmailTemplatesView } from "@/components/EmailTemplatesView";
import { EmailTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");

  // Controls the wording of every candidate/internal email the system
  // sends — hr_management only, hard redirect rather than an inline
  // "Restricted" message so the surface area isn't even reachable by URL
  // (same pattern as Document Templates and Settings).
  if (session.role !== "hr_management") redirect("/");

  const user = { id: session.sub, name: session.name, email: session.email, role: session.role };

  const supabase = supabaseServer();
  const { data: templatesData } = await supabase.from("email_templates").select("*").order("label", { ascending: true });

  return (
    <AppShell user={user}>
      <EmailTemplatesView initialTemplates={(templatesData as EmailTemplate[]) ?? []} />
    </AppShell>
  );
}
