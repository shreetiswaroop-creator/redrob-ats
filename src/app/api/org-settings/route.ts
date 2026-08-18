import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

// Deliberately excludes common_hr_gmail_refresh_token_encrypted — even
// encrypted at rest, there's no reason to ever ship that ciphertext to a
// browser. Add new non-secret org_settings columns here as they're added.
const SAFE_COLUMNS =
  "id, hr_management_emails, common_hr_mailbox_name, common_hr_mailbox_email, hrms_team_email, common_hr_gmail_connected_at, live_sending_enabled, default_step_tat_hours, logo_url";

// This whole settings surface only has one consumer (the Settings page),
// which is itself hr_management-gated — so both read and write are
// restricted here too, not just hidden from nav.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can view org settings." }, { status: 403 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase.from("org_settings").select(SAFE_COLUMNS).eq("id", "default").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const EDITABLE_FIELDS = [
  "hr_management_emails",
  "common_hr_mailbox_name",
  "common_hr_mailbox_email",
  "hrms_team_email",
  "live_sending_enabled",
  "default_step_tat_hours",
] as const;

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can edit org settings." }, { status: 403 });
  }

  const body = await req.json();
  const update: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("org_settings")
    .update(update)
    .eq("id", "default")
    .select(SAFE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
