import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { hashPassword } from "@/lib/password";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can view accounts." }, { status: 403 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, created_at, created_by, gmail_email, gmail_connected_at, deactivated_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can add accounts." }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role } = body;
  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: "Name, email, password, and role are required." }, { status: 400 });
  }
  if (role !== "recruiter" && role !== "hr_management" && role !== "hiring_manager") {
    return NextResponse.json({ error: "Role must be 'recruiter', 'hr_management', or 'hiring_manager'." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("users")
    .insert({
      name,
      email: String(email).toLowerCase().trim(),
      password_hash: await hashPassword(password),
      role,
      created_by: session.name,
    })
    .select("id, name, email, role, created_at, created_by, gmail_email, gmail_connected_at, deactivated_at")
    .single();

  if (error) {
    const message = error.code === "23505" ? "An account with this email already exists." : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
