// Creates a real Calendar event (calendar.events scope — create/manage
// only, never reads anyone's existing calendar). sendUpdates=all makes
// Google email the invite to every attendee automatically. Never called
// directly outside the /api/interviews route, and only when
// org_settings.live_sending_enabled is true.
export async function createCalendarEvent(params: {
  accessToken: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendeeEmails: string[];
}): Promise<{ eventId: string; htmlLink: string }> {
  const attendees = Array.from(new Set(params.attendeeEmails.filter(Boolean))).map((email) => ({ email }));

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.startIso },
        end: { dateTime: params.endIso },
        attendees,
      }),
    }
  );
  if (!res.ok) throw new Error(`Calendar event creation failed: ${await res.text()}`);
  const data = await res.json();
  return { eventId: data.id as string, htmlLink: data.htmlLink as string };
}
