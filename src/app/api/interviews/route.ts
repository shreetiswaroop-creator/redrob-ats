import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { Candidate, deriveInterviewRoundName, OrgSettings, Requisition } from "@/lib/types";
import { EMPTY_ORG_SETTINGS, fetchEmailTemplates, insertNotifications, interviewScheduledNotification } from "@/lib/notifications";
import { decryptToken } from "@/lib/token-crypto";
import { refreshAccessToken } from "@/lib/google-oauth";
import { createCalendarEvent } from "@/lib/google-calendar";

function formatConflictRange(startMs: number, endMs: number): string {
  const start = new Date(startMs).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const end = new Date(endMs).toLocaleTimeString("en-US", { timeStyle: "short" });
  return `${start} – ${end}`;
}

// Returns a human-readable conflict message if any requested panelist
// (user or directory) already has another interview whose [start, start +
// duration) window overlaps the requested one — checked against every
// existing interview since this app's scale doesn't call for narrowing the
// query first. Returns null when there's no conflict.
async function findPanelistDoubleBooking(
  supabase: ReturnType<typeof supabaseServer>,
  requestedStart: number,
  requestedEnd: number,
  requestedPanelistUserIds: string[],
  requestedPanelistIds: string[]
): Promise<string | null> {
  const { data: existingInterviews } = await supabase
    .from("interviews")
    .select("scheduled_at, duration_minutes, panelist_user_ids, panelist_ids");

  for (const existing of existingInterviews ?? []) {
    const existingStart = new Date(existing.scheduled_at as string).getTime();
    const existingEnd = existingStart + (existing.duration_minutes as number) * 60000;
    const overlaps = requestedStart < existingEnd && existingStart < requestedEnd;
    if (!overlaps) continue;

    const conflictUserId = (existing.panelist_user_ids as string[]).find((id) => requestedPanelistUserIds.includes(id));
    const conflictPanelistId = (existing.panelist_ids as string[]).find((id) => requestedPanelistIds.includes(id));
    if (!conflictUserId && !conflictPanelistId) continue;

    const conflictName = conflictUserId
      ? (await supabase.from("users").select("name").eq("id", conflictUserId).maybeSingle()).data?.name
      : (await supabase.from("panelists").select("name").eq("id", conflictPanelistId as string).maybeSingle()).data?.name;

    return `${conflictName ?? "That panelist"} already has an interview scheduled ${formatConflictRange(
      existingStart,
      existingEnd
    )}, which overlaps with this time.`;
  }

  return null;
}

export async function GET() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .order("scheduled_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();

  const required = ["requisition_id", "candidate_id", "round_number", "scheduled_at", "mode"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const supabase = supabaseServer();

  const requestedStart = new Date(body.scheduled_at).getTime();
  if (Number.isNaN(requestedStart)) {
    return NextResponse.json({ error: "That date/time couldn't be parsed." }, { status: 400 });
  }
  const requestedDuration = (body.duration_minutes as number) ?? 30;
  const requestedEnd = requestedStart + requestedDuration * 60000;
  const requestedPanelistUserIds: string[] = body.panelist_user_ids ?? [];
  const requestedPanelistIds: string[] = body.panelist_ids ?? [];

  if (requestedPanelistUserIds.length || requestedPanelistIds.length) {
    const conflictError = await findPanelistDoubleBooking(
      supabase,
      requestedStart,
      requestedEnd,
      requestedPanelistUserIds,
      requestedPanelistIds
    );
    if (conflictError) return NextResponse.json({ error: conflictError }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      requisition_id: body.requisition_id,
      candidate_id: body.candidate_id,
      round_number: body.round_number,
      panelist_user_ids: requestedPanelistUserIds,
      panelist_ids: requestedPanelistIds,
      scheduled_at: body.scheduled_at,
      duration_minutes: requestedDuration,
      mode: body.mode,
      created_by: session.name,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: candidateRow }, { data: requisitionRow }, { data: orgSettingsRow }, templates] = await Promise.all([
    supabase.from("candidates").select("*").eq("id", body.candidate_id).single(),
    supabase.from("requisitions").select("*").eq("id", body.requisition_id).single(),
    supabase.from("org_settings").select("*").eq("id", "default").single(),
    fetchEmailTemplates(supabase),
  ]);
  if (candidateRow && requisitionRow) {
    const org: OrgSettings = (orgSettingsRow as OrgSettings) ?? EMPTY_ORG_SETTINGS;
    const roundName = deriveInterviewRoundName(body.round_number);
    const durationMinutes = (body.duration_minutes as number) ?? 30;
    const draft = interviewScheduledNotification(
      candidateRow as Candidate,
      requisitionRow as Requisition,
      roundName,
      body.scheduled_at,
      durationMinutes,
      templates,
      body.meeting_link || undefined
    );
    await insertNotifications(supabase, [draft], body.requisition_id, body.candidate_id, org);

    // Calendar invite uses the scheduling recruiter's own connected
    // account (same token as their Gmail connection, since both scopes
    // were granted together) — silently skipped if they haven't connected,
    // exactly like an unconnected recruiter's emails stay log-only.
    if (org.live_sending_enabled) {
      try {
        const { data: schedulingUser } = await supabase
          .from("users")
          .select("gmail_refresh_token_encrypted")
          .eq("id", session.sub)
          .maybeSingle();
        if (schedulingUser?.gmail_refresh_token_encrypted) {
          const [{ data: panelistUsers }, { data: panelistDirectory }] = await Promise.all([
            (body.panelist_user_ids as string[])?.length
              ? supabase.from("users").select("email").in("id", body.panelist_user_ids)
              : Promise.resolve({ data: [] as { email: string }[] }),
            (body.panelist_ids as string[])?.length
              ? supabase.from("panelists").select("email").in("id", body.panelist_ids)
              : Promise.resolve({ data: [] as { email: string | null }[] }),
          ]);
          const attendeeEmails = [
            (candidateRow as Candidate).personal_email,
            ...(panelistUsers ?? []).map((u) => u.email),
            ...(panelistDirectory ?? []).map((p) => p.email),
          ].filter((e): e is string => !!e);

          const refreshToken = decryptToken(schedulingUser.gmail_refresh_token_encrypted);
          const { access_token } = await refreshAccessToken(refreshToken);
          const startIso = body.scheduled_at as string;
          const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60 * 1000).toISOString();
          await createCalendarEvent({
            accessToken: access_token,
            summary: `${roundName} — ${(candidateRow as Candidate).name} (${(requisitionRow as Requisition).title})`,
            description: `Interview round: ${roundName}\nCandidate: ${(candidateRow as Candidate).name} (${(candidateRow as Candidate).candidate_code})\nRequisition: ${(requisitionRow as Requisition).title} (${(requisitionRow as Requisition).req_code})${
              body.meeting_link ? `\nMeeting link: ${body.meeting_link}` : ""
            }`,
            startIso,
            endIso,
            attendeeEmails,
          });
        }
      } catch {
        // Best-effort — a calendar hiccup shouldn't fail interview creation,
        // which has already succeeded and been saved by this point.
      }
    }
  }

  return NextResponse.json(data, { status: 201 });
}
