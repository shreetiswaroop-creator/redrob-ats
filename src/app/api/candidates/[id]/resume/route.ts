import { NextRequest, NextResponse } from "next/server";
import { put, del, get } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate } from "@/lib/types";

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
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

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

  // Replacing an existing resume — remove the old blob so it doesn't linger.
  if (candidate.resume_pathname) {
    await del(candidate.resume_pathname).catch(() => {});
  }

  const extension = file.name.slice(file.name.lastIndexOf("."));
  const pathname = `resumes/${id}/${Date.now()}${extension}`;
  const blob = await put(pathname, file, { access: "private" });

  const auditLog = appendAudit(candidate.audit_log, session.name, "Uploaded resume", file.name);
  const { data, error } = await supabase
    .from("candidates")
    .update({ resume_pathname: blob.pathname, resume_filename: file.name, audit_log: auditLog })
    .eq("id", id)
    .select()
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
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

  if (!candidate.resume_pathname) {
    return NextResponse.json({ error: "No resume on file for this candidate." }, { status: 404 });
  }

  const result = await get(candidate.resume_pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "Resume file could not be retrieved." }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(candidate.resume_filename ?? "resume").replace(/"/g, "")}"`,
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
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

  if (!candidate.resume_pathname) {
    return NextResponse.json({ error: "No resume on file for this candidate." }, { status: 400 });
  }

  await del(candidate.resume_pathname).catch(() => {});

  const auditLog = appendAudit(candidate.audit_log, session.name, "Removed resume", candidate.resume_filename ?? undefined);
  const { data, error } = await supabase
    .from("candidates")
    .update({ resume_pathname: null, resume_filename: null, audit_log: auditLog })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
