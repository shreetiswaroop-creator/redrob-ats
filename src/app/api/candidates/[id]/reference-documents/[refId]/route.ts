import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { Candidate } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id, refId } = await params;
  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

  const reference = candidate.reference_records.find((r) => r.id === refId);
  if (!reference || !reference.document_pathname) {
    return NextResponse.json({ error: "No generated document on file for this reference." }, { status: 404 });
  }

  const result = await get(reference.document_pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "Document could not be retrieved." }, { status: 404 });
  }

  const filename = `Reference-Check-${candidate.candidate_code}-${(reference.name || refId).replace(/[^a-zA-Z0-9-]+/g, "_")}.pdf`;
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
