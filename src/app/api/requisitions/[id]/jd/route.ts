import { NextRequest, NextResponse } from "next/server";
import { put, del, get } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { Requisition } from "@/lib/types";

// Mirrors src/app/api/candidates/[id]/resume/route.ts exactly, for the same
// object-storage pattern applied to a requisition's formal JD document
// instead of a candidate's resume. Requisitions have no audit_log column
// (unlike candidates), so there's nothing to append here.
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("requisitions").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  const requisition = existing as Requisition;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!hasAllowedExtension(file.name)) {
    return NextResponse.json({ error: "Only PDF or Word (.pdf, .doc, .docx) files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (10MB max)." }, { status: 400 });
  }

  // Replacing an existing JD document — remove the old blob so it doesn't linger.
  if (requisition.jd_pathname) {
    await del(requisition.jd_pathname).catch(() => {});
  }

  const extension = file.name.slice(file.name.lastIndexOf("."));
  const pathname = `jds/${id}/${Date.now()}${extension}`;
  const blob = await put(pathname, file, { access: "private" });

  const { data, error } = await supabase
    .from("requisitions")
    .update({ jd_pathname: blob.pathname, jd_filename: file.name })
    .eq("id", id)
    .select("*, client:clients(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("requisitions").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  const requisition = existing as Requisition;

  if (!requisition.jd_pathname) {
    return NextResponse.json({ error: "No JD document on file for this requisition." }, { status: 404 });
  }

  const result = await get(requisition.jd_pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "JD document could not be retrieved." }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(requisition.jd_filename ?? "jd").replace(/"/g, "")}"`,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("requisitions").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  const requisition = existing as Requisition;

  if (!requisition.jd_pathname) {
    return NextResponse.json({ error: "No JD document on file for this requisition." }, { status: 400 });
  }

  await del(requisition.jd_pathname).catch(() => {});

  const { data, error } = await supabase
    .from("requisitions")
    .update({ jd_pathname: null, jd_filename: null })
    .eq("id", id)
    .select("*, client:clients(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
