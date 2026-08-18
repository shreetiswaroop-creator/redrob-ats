import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can edit email templates." }, { status: 403 });
  }

  const { key } = await params;
  const body = await req.json();
  const { subject_template, body_template } = body;
  if (!subject_template || !body_template) {
    return NextResponse.json({ error: "Both subject and body are required." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("email_templates")
    .update({
      subject_template,
      body_template,
      updated_by: session.name,
      updated_at: new Date().toISOString(),
    })
    .eq("template_key", key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
