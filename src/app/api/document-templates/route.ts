import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

// Controls the actual documents generated and sent for every candidate's
// reference check / HR BGV, so this is gated to hr_management the same way
// Email Templates is — for both read and write, not just hidden from nav.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can view document templates." }, { status: 403 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("document_templates").select("*").order("label", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
