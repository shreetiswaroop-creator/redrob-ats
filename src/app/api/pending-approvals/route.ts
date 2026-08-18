import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { Candidate, Requisition } from "@/lib/types";
import { computePendingApprovals } from "@/lib/pendingApprovals";

// Same restriction as every other HR-only surface (org-settings, Settings
// page, Recruiter Comparison) — this is real HR-management-only data
// (reference exceptions, TAT grace requests, offer document drafts), not
// just a nav item hidden from recruiters.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can view pending approvals." }, { status: 403 });
  }

  const supabase = supabaseServer();
  const [reqRes, candRes] = await Promise.all([
    supabase.from("requisitions").select("*").eq("archived", false),
    supabase.from("candidates").select("*").eq("archived", false),
  ]);
  if (reqRes.error) return NextResponse.json({ error: reqRes.error.message }, { status: 500 });
  if (candRes.error) return NextResponse.json({ error: candRes.error.message }, { status: 500 });

  const items = computePendingApprovals((reqRes.data as Requisition[]) ?? [], (candRes.data as Candidate[]) ?? []);
  return NextResponse.json({ items });
}
