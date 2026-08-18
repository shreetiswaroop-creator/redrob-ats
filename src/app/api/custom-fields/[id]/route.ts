import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { CustomFieldDefinition } from "@/lib/types";

// field_key, field_type, and entity_type are immutable after creation —
// renaming/retyping in place would silently strand whatever's already
// stored under the old key/shape in every existing record's jsonb blob.
// Only label, required, select_options (for select fields), and
// display_order (for reordering) can be edited.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can edit custom fields." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const supabase = supabaseServer();

  const { data: existing, error: fetchError } = await supabase
    .from("custom_field_definitions")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Custom field not found." }, { status: 404 });
  }
  const definition = existing as CustomFieldDefinition;

  const update: Record<string, unknown> = {};
  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return NextResponse.json({ error: "Label is required." }, { status: 400 });
    update.label = label;
  }
  if ("required" in body) update.required = !!body.required;
  if ("display_order" in body) update.display_order = Number(body.display_order);
  if ("select_options" in body) {
    if (definition.field_type !== "select") {
      return NextResponse.json({ error: "Only select fields have options." }, { status: 400 });
    }
    const options = Array.isArray(body.select_options)
      ? body.select_options.map((o: unknown) => String(o).trim()).filter(Boolean)
      : [];
    if (options.length < 1) {
      return NextResponse.json({ error: "A select field needs at least one option." }, { status: 400 });
    }
    update.select_options = Array.from(new Set(options));
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  const { data, error } = await supabase.from("custom_field_definitions").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can delete custom fields." }, { status: 403 });
  }

  const { id } = await params;
  const confirm = req.nextUrl.searchParams.get("confirm") === "true";
  const supabase = supabaseServer();

  const { data: existing, error: fetchError } = await supabase
    .from("custom_field_definitions")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Custom field not found." }, { status: 404 });
  }
  const definition = existing as CustomFieldDefinition;
  const table = definition.entity_type === "candidate" ? "candidates" : "requisitions";

  // Deleting the definition doesn't retroactively strip data from
  // custom_fields — it just becomes unlabeled/orphaned — so surface how many
  // existing records already have a value here before actually deleting,
  // unless the caller has already confirmed past that warning.
  if (!confirm) {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .not(`custom_fields->>${definition.field_key}`, "is", null);
    if (count && count > 0) {
      return NextResponse.json({ warning: true, count }, { status: 409 });
    }
  }

  const { error } = await supabase.from("custom_field_definitions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
