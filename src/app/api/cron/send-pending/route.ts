import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { EMPTY_ORG_SETTINGS, processDuePendingNotifications } from "@/lib/notifications";
import { OrgSettings } from "@/lib/types";

// Hit by a free external scheduler (e.g. cron-job.org) every few minutes,
// since this app is on Vercel's Hobby plan, which only allows daily cron —
// too infrequent for a 15-minute send-delay window. Protected by a shared
// secret rather than a login, since the scheduler isn't a logged-in user.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data: orgRow } = await supabase.from("org_settings").select("*").eq("id", "default").single();
  const org = (orgRow as OrgSettings) ?? EMPTY_ORG_SETTINGS;
  const result = await processDuePendingNotifications(supabase, org);
  return NextResponse.json({ ok: true, ...result });
}
