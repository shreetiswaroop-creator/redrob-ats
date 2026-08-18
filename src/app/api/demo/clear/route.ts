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

  // Clean up every blob a demo candidate could reference before deleting the
  // rows — once the row is gone, nothing in the database points at these
  // files anymore and they'd otherwise sit in Blob storage forever.
  const { data: demoCandidates } = await supabase
    .from("candidates")
    .select(
      "id, resume_pathname, photo_pathname, education_proof_pathname, id_proof_pathname, salary_slip_pathname, bgv_document_pathname, reference_records, offer_document_approvals"
    )
    .eq("is_demo", true);
  const pathnames: string[] = [];
  for (const c of (demoCandidates as Candidate[]) ?? []) {
    for (const p of [
      c.resume_pathname,
      c.photo_pathname,
      c.education_proof_pathname,
      c.id_proof_pathname,
      c.salary_slip_pathname,
      c.bgv_document_pathname,
    ]) {
      if (p) pathnames.push(p);
    }
    for (const ref of c.reference_records ?? []) {
      if (ref.document_pathname) pathnames.push(ref.document_pathname);
    }
    const finalPdfPathname = c.offer_document_approvals?.employee_agreement?.final_pdf_pathname;
    if (finalPdfPathname) pathnames.push(finalPdfPathname);
  }
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
