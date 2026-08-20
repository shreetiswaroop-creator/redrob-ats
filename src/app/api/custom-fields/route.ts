import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { CUSTOM_FIELD_TYPES, CustomFieldEntityType } from "@/lib/types";
import { slugifyFieldKey } from "@/lib/customFields";

// GET is intentionally open to any signed-in user (not hr_management-only):
// recruiters need these definitions to render the dynamic fields on the
// Candidates and Requisitions pages. Only creating/editing/deleting a
// definition (below, and in [id]/route.ts) is hr_management-gated.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const entityType = req.nextUrl.searchParams.get("entity_type");
  const supabase = supabaseServer();
  let query = supabase.from("custom_field_definitions").select("*").order("display_order", { ascending: true });
  if (entityType) query = query.eq("entity_type", entityType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can add custom fields." }, { status: 403 });
  }

  const body = await req.json();
  const entityType = body.entity_type as CustomFieldEntityType;
  if (entityType !== "candidate" && entityType !== "requisition") {
    return NextResponse.json({ error: "entity_type must be 'candidate' or 'requisition'." }, { status: 400 });
  }
  if (!CUSTOM_FIELD_TYPES.includes(body.field_type)) {
    return NextResponse.json({ error: "Invalid field_type." }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Label is required." }, { status: 400 });
  }

  let selectOptions: string[] | null = null;
  if (body.field_type === "select") {
    const options = Array.isArray(body.select_options)
      ? body.select_options.map((o: unknown) => String(o).trim()).filter(Boolean)
      : [];
    if (options.length < 1) {
      return NextResponse.json({ error: "A select field needs at least one option." }, { status: 400 });
    }
    selectOptions = Array.from(new Set(options));
  }

  const fieldKey = slugifyFieldKey(label);
  if (!fieldKey) {
    return NextResponse.json({ error: "Label must contain at least one letter or number." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data: existing } = await supabase
    .from("custom_field_definitions")
    .select("display_order")
    .eq("entity_type", entityType)
    .order("display_order", { ascending: false })
    .limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

  const { data, error } = await supabase
    .from("custom_field_definitions")
    .insert({
      entity_type: entityType,
      field_key: fieldKey,
      label,
      field_type: body.field_type,
      select_options: selectOptions,
      required: !!body.required,
      display_order: nextOrder,
      created_by: session.name,
    })
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "A field with this label (or a very similar one) already exists." : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
