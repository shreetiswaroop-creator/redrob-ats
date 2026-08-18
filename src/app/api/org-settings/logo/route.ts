import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".webp"];

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// GET is intentionally public (no session check) — a logo URL isn't
// sensitive, and RedrobLogo needs to render it on the login page too,
// before anyone is signed in.
export async function GET() {
  const supabase = supabaseServer();
  const { data } = await supabase.from("org_settings").select("logo_url").eq("id", "default").single();
  return NextResponse.json({ logo_url: data?.logo_url ?? null });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can change the logo." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!hasAllowedExtension(file.name)) {
    return NextResponse.json({ error: "Only PNG, JPG, SVG, or WebP images are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (2MB max)." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: existing } = await supabase.from("org_settings").select("logo_url").eq("id", "default").single();
  if (existing?.logo_url) {
    // Public blobs are addressed by URL, not pathname — del() accepts either.
    await del(existing.logo_url).catch(() => {});
  }

  const extension = file.name.slice(file.name.lastIndexOf("."));
  const pathname = `branding/logo-${Date.now()}${extension}`;
  const blob = await put(pathname, file, { access: "public" });

  const { data, error } = await supabase
    .from("org_settings")
    .update({ logo_url: blob.url })
    .eq("id", "default")
    .select("logo_url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can change the logo." }, { status: 403 });
  }

  const supabase = supabaseServer();
  const { data: existing } = await supabase.from("org_settings").select("logo_url").eq("id", "default").single();
  if (existing?.logo_url) {
    await del(existing.logo_url).catch(() => {});
  }

  const { data, error } = await supabase
    .from("org_settings")
    .update({ logo_url: null })
    .eq("id", "default")
    .select("logo_url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
