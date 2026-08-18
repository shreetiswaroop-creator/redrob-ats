import { NextRequest, NextResponse } from "next/server";
import { put, del, get } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate } from "@/lib/types";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png"];

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
    return NextResponse.json({ error: "Only JPG or PNG images are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (5MB max)." }, { status: 400 });
  }

  // Replacing an existing photo — remove the old blob so it doesn't linger.
  if (candidate.photo_pathname) {
    await del(candidate.photo_pathname).catch(() => {});
  }

  const extension = file.name.slice(file.name.lastIndexOf("."));
  const pathname = `photos/${id}/${Date.now()}${extension}`;
  const blob = await put(pathname, file, { access: "private" });

  const auditLog = appendAudit(candidate.audit_log, session.name, "Uploaded photo", file.name);
  const { data, error } = await supabase
    .from("candidates")
    .update({ photo_pathname: blob.pathname, photo_filename: file.name, audit_log: auditLog })
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

  if (!candidate.photo_pathname) {
    return NextResponse.json({ error: "No photo on file for this candidate." }, { status: 404 });
  }

  const result = await get(candidate.photo_pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "Photo could not be retrieved." }, { status: 404 });
  }

  // Inline (not attachment) so it can be used directly as an <img src> —
  // unlike the resume, a photo is meant to be viewed, not downloaded.
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(candidate.photo_filename ?? "photo").replace(/"/g, "")}"`,
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

  if (!candidate.photo_pathname) {
    return NextResponse.json({ error: "No photo on file for this candidate." }, { status: 400 });
  }

  await del(candidate.photo_pathname).catch(() => {});

  const auditLog = appendAudit(candidate.audit_log, session.name, "Removed photo", candidate.photo_filename ?? undefined);
  const { data, error } = await supabase
    .from("candidates")
    .update({ photo_pathname: null, photo_filename: null, audit_log: auditLog })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
