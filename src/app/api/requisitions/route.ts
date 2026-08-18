import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { CustomFieldDefinition } from "@/lib/types";
import { validateCustomFieldValues } from "@/lib/customFields";

export async function GET(req: NextRequest) {
  const archivedParam = req.nextUrl.searchParams.get("archived");
  const supabase = supabaseServer();
  let query = supabase.from("requisitions").select("*, client:clients(name)").order("created_at", { ascending: false });
  if (archivedParam === "true") query = query.eq("archived", true);
  else if (archivedParam === "false") query = query.eq("archived", false);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();

  const required = ["title", "position_type", "hiring_manager", "client_id"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  // Only hr_management can raise a requisition straight into Approved,
  // bypassing the Raised review step — a recruiter-sent flag here is
  // ignored/rejected rather than trusted, same as every other role gate in
  // this app.
  const skipApproval = !!body.approval_skipped;
  if (skipApproval && session.role !== "hr_management") {
    return NextResponse.json(
      { error: "Only HR Management can raise a requisition directly into Approved." },
      { status: 403 }
    );
  }
  const now = new Date().toISOString();

  const supabase = supabaseServer();

  const { data: fieldDefs } = await supabase
    .from("custom_field_definitions")
    .select("*")
    .eq("entity_type", "requisition");
  const customFieldsResult = validateCustomFieldValues((fieldDefs as CustomFieldDefinition[]) ?? [], body.custom_fields);
  if (!customFieldsResult.ok) {
    return NextResponse.json({ error: customFieldsResult.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("requisitions")
    .insert({
      title: body.title,
      client_id: body.client_id,
      urgency: body.urgency ?? "medium",
      description: body.description ?? null,
      department: body.department ?? null,
      level: body.level ?? null,
      location: body.location ?? null,
      headcount: body.headcount ?? 1,
      must_have_skills: body.must_have_skills ?? null,
      budget_band: body.budget_band ?? null,
      position_type: body.position_type,
      hiring_manager: body.hiring_manager,
      hiring_manager_email: body.hiring_manager_email ?? null,
      closure_tat_days: body.closure_tat_days ?? 30,
      status: skipApproval ? "approved" : "raised",
      approved_at: skipApproval ? now : null,
      approved_by: skipApproval ? session.name : null,
      approval_skipped: skipApproval,
      custom_fields: customFieldsResult.cleaned,
    })
    .select("*, client:clients(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
