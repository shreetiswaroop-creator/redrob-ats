import { NextRequest, NextResponse } from "next/server";
import { put, del, get } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate } from "@/lib/types";

// Step 1 (Pre-Offer Formalities) intake documents (PRD §7.2) — each kind gets
// its own dedicated pathname/filename column pair, same private-Blob pattern
// as the resume/photo, rather than the retired generic document repository.
const KIND_CONFIG = {
  education_proof: { pathnameCol: "education_proof_pathname", filenameCol: "education_proof_filename", label: "education proof", blobDir: "education-proof" },
  id_proof: { pathnameCol: "id_proof_pathname", filenameCol: "id_proof_filename", label: "government ID proof", blobDir: "id-proof" },
  salary_slip: { pathnameCol: "salary_slip_pathname", filenameCol: "salary_slip_filename", label: "salary slip", blobDir: "salary-slip" },
} as const;

type DocKind = keyof typeof KIND_CONFIG;

function isDocKind(value: string): value is DocKind {
  return value in KIND_CONFIG;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id, kind } = await params;
  if (!isDocKind(kind)) return NextResponse.json({ error: "Unknown document kind." }, { status: 400 });
  const config = KIND_CONFIG[kind];

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
    return NextResponse.json({ error: "Only PDF, JPG, or PNG files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (10MB max)." }, { status: 400 });
  }

  const existingPathname = candidate[config.pathnameCol as keyof Candidate] as string | null;
  if (existingPathname) {
    await del(existingPathname).catch(() => {});
  }

  const extension = file.name.slice(file.name.lastIndexOf("."));
  const pathname = `${config.blobDir}/${id}/${Date.now()}${extension}`;
  const blob = await put(pathname, file, { access: "private" });

  const auditLog = appendAudit(candidate.audit_log, session.name, `Uploaded ${config.label}`, file.name);
  const { data, error } = await supabase
    .from("candidates")
    .update({ [config.pathnameCol]: blob.pathname, [config.filenameCol]: file.name, audit_log: auditLog })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id, kind } = await params;
  if (!isDocKind(kind)) return NextResponse.json({ error: "Unknown document kind." }, { status: 400 });
  const config = KIND_CONFIG[kind];

  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

  const pathname = candidate[config.pathnameCol as keyof Candidate] as string | null;
  const filename = candidate[config.filenameCol as keyof Candidate] as string | null;
  if (!pathname) {
    return NextResponse.json({ error: `No ${config.label} on file for this candidate.` }, { status: 404 });
  }

  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "File could not be retrieved." }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(filename ?? config.label).replace(/"/g, "")}"`,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id, kind } = await params;
  if (!isDocKind(kind)) return NextResponse.json({ error: "Unknown document kind." }, { status: 400 });
  const config = KIND_CONFIG[kind];

  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

  const pathname = candidate[config.pathnameCol as keyof Candidate] as string | null;
  if (!pathname) {
    return NextResponse.json({ error: `No ${config.label} on file for this candidate.` }, { status: 400 });
  }

  await del(pathname).catch(() => {});

  const filename = candidate[config.filenameCol as keyof Candidate] as string | null;
  const auditLog = appendAudit(candidate.audit_log, session.name, `Removed ${config.label}`, filename ?? undefined);
  const { data, error } = await supabase
    .from("candidates")
    .update({ [config.pathnameCol]: null, [config.filenameCol]: null, audit_log: auditLog })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
