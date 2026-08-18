import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

// Mirrors src/app/api/panelists/route.ts — same "any signed-in user can list
// or add" shape, since raising a requisition (any recruiter) needs to be
// able to add a new client inline.
export async function GET() {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("clients").select("*").order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("clients")
    .insert({ name: body.name.trim(), created_by: session.name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
