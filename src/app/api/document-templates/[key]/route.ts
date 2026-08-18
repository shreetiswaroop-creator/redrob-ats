import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can edit document templates." }, { status: 403 });
  }

  const { key } = await params;
  const body = await req.json();
  const { section_a_intro, section_a_questions, section_b_text, section_c_note } = body;
  if (!section_a_intro || !Array.isArray(section_a_questions) || !section_b_text || !section_c_note) {
    return NextResponse.json(
      { error: "Section A intro, at least the question list, Section B text, and Section C note are all required." },
      { status: 400 }
    );
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("document_templates")
    .update({
      section_a_intro,
      section_a_questions,
      section_b_text,
      section_c_note,
      updated_by: session.name,
      updated_at: new Date().toISOString(),
    })
    .eq("template_key", key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
