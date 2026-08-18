import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

// Archives rather than hard-deletes — panelist_ids on interviews has no
// enforced foreign key, so removing the row outright would silently drop
// this panelist's name from any past interview that had them. Archiving
// just stops them appearing as an option for new interviews.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("panelists")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
