import { redirect } from "next/navigation";
import { getSessionUserFromCookies } from "@/lib/session-server";
import { HiringManagerReviewView } from "@/components/HiringManagerReviewView";

export const dynamic = "force-dynamic";

// Deliberately NOT wrapped in AppShell — this role gets no Sidebar, no
// Dashboard, no other nav item, ever. A recruiter/HR Management account
// that somehow lands here (e.g. a stale bookmark) gets bounced to their
// normal home instead of seeing a page built for someone else's role.
export default async function HiringManagerPage() {
  const session = await getSessionUserFromCookies();
  if (!session) redirect("/login");
  if (session.role !== "hiring_manager") redirect("/");

  return <HiringManagerReviewView userName={session.name} />;
}
