import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { del } from "@vercel/blob";
import { Candidate } from "@/lib/types";

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can clear demo data." }, { status: 403 });
  }

  const supabase = supabaseServer();

  // Clean up any resumes uploaded onto demo candidates before deleting rows.
  const { data: demoCandidates } = await supabase
    .from("candidates")
    .select("id, resume_pathname")
    .eq("is_demo", true);
  const pathnames = ((demoCandidates as Pick<Candidate, "id" | "resume_pathname">[]) ?? [])
    .map((c) => c.resume_pathname)
    .filter((p): p is string => !!p);
  if (pathnames.length > 0) {
    await del(pathnames).catch(() => {});
  }

  const { error: candError, count: candCount } = await supabase
    .from("candidates")
    .delete({ count: "exact" })
    .eq("is_demo", true);
  if (candError) return NextResponse.json({ error: candError.message }, { status: 500 });

  const { error: reqError, count: reqCount } = await supabase
    .from("requisitions")
    .delete({ count: "exact" })
    .eq("is_demo", true);
  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 500 });

  return NextResponse.json({ candidatesDeleted: candCount ?? 0, requisitionsDeleted: reqCount ?? 0 });
}
