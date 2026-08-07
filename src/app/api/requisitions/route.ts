import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("requisitions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();

  const required = ["title", "position_type", "hiring_manager"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("requisitions")
    .insert({
      title: body.title,
      department: body.department ?? null,
      level: body.level ?? null,
      location: body.location ?? null,
      headcount: body.headcount ?? 1,
      must_have_skills: body.must_have_skills ?? null,
      budget_band: body.budget_band ?? null,
      position_type: body.position_type,
      hiring_manager: body.hiring_manager,
      hiring_manager_email: body.hiring_manager_email ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
