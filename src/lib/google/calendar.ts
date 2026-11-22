import "server-only";
import { sql } from "../db";
import { errorText, google, GoogleError, googleSettings } from "./client";
import { eventBody } from "./format";

type CalEvent = { id: string; htmlLink?: string };
const cal = (id: string) => `/calendar/v3/calendars/${encodeURIComponent(id)}`;

/** The calendar visits go to. In test mode, makes the "Job Hub TEST" calendar the first time. */
export async function activeCalendarId(email: string) {
  const s = await googleSettings();
  if (s.mode === "live") return s.live.calendarId;
  if (s.test.calendarId) return s.test.calendarId;
  const made = await google<{ id: string }>(email, "/calendar/v3/calendars", {
    method: "POST",
    body: { summary: "Job Hub TEST", timeZone: "Europe/London", description: "Test calendar for the Batt Job Hub. Safe to delete." },
  });
  await sql`update settings set value = jsonb_set(value, '{test,calendarId}', to_jsonb(${made.id}::text)), updated_at = now() where key = 'google'`;
  return made.id;
}

/**
 * Puts a visit in Google Calendar (or updates it) and invites whoever is on it.
 * Never throws: a problem is saved on the visit and shown with a retry button.
 */
export async function syncVisit(visitId: string, email: string): Promise<string> {
  const [v] = await sql<
    {
      date: string; start_time: string | null; end_time: string | null; work: string; site: string; confirmed: boolean; notes: string;
      calendar_event_id: string; calendar_id: string; job_number: number | null; job_site: string | null; postcode: string | null;
      contact: string | null; client: string | null; folder: string | null;
    }[]
  >`
    select v.date, v.start_time::text, v.end_time::text, v.work, v.site, v.confirmed, v.notes, v.calendar_event_id, v.calendar_id,
      j.number as job_number, j.site as job_site, j.postcode, j.contact, c.name as client, j.drive_folder_url as folder
    from visits v left join jobs j on j.id = v.job_id left join clients c on c.id = j.client_id where v.id = ${visitId}`;
  if (!v) return "";
  try {
    const calendarId = await activeCalendarId(email);
    if (v.calendar_event_id && v.calendar_id && v.calendar_id !== calendarId) {
      const text = "Its calendar entry is on a different calendar (the app is in test mode), so that entry wasn't changed.";
      await sql`update visits set calendar_error = ${text} where id = ${visitId}`;
      return `Calendar not updated. ${text}`;
    }
    const people = await sql<{ short_name: string; email: string }[]>`
      select p.short_name, p.email from visit_people vp join people p on p.id = vp.person_id where vp.visit_id = ${visitId} order by p.position`;
    const body = eventBody({
      jobNumber: v.job_number,
      client: v.client,
      contact: v.contact ?? "",
      site: v.site || [v.job_site, v.postcode].filter(Boolean).join(", "),
      work: v.work,
      notes: v.notes,
      folderUrl: v.folder ?? "",
      date: v.date,
      start: v.start_time?.slice(0, 5) ?? null,
      end: v.end_time?.slice(0, 5) ?? null,
      confirmed: v.confirmed,
      people: [...people],
    });
    const query = { sendUpdates: "externalOnly" };
    let event: CalEvent | null = null;
    if (v.calendar_event_id) {
      try {
        event = await google<CalEvent>(email, `${cal(calendarId)}/events/${encodeURIComponent(v.calendar_event_id)}`, { method: "PATCH", query, body });
      } catch (e) {
        if (!(e instanceof GoogleError) || (e.status !== 404 && e.status !== 410)) throw e;
      }
    }
    if (!event) event = await google<CalEvent>(email, `${cal(calendarId)}/events`, { method: "POST", query, body });
    await sql`update visits set calendar_event_id = ${event.id}, calendar_link = ${event.htmlLink ?? ""}, calendar_id = ${calendarId}, calendar_error = '' where id = ${visitId}`;
    const noEmail = people.filter((p) => !p.email).map((p) => p.short_name);
    return `In the calendar${noEmail.length ? `, but ${noEmail.join(" and ")} can't be invited until their email is added in Settings` : ""}.`;
  } catch (e) {
    const text = errorText(e);
    await sql`update visits set calendar_error = ${text} where id = ${visitId}`;
    return `Not in the calendar: ${text}`;
  }
}

/** Removes a visit's calendar entry, if it's on the calendar the app is using. */
export async function removeVisitEvent(v: { calendar_event_id: string; calendar_id: string }, email: string) {
  if (!v.calendar_event_id) return;
  const calendarId = await activeCalendarId(email);
  if (v.calendar_id && v.calendar_id !== calendarId) return;
  try {
    await google(email, `${cal(calendarId)}/events/${encodeURIComponent(v.calendar_event_id)}`, { method: "DELETE", query: { sendUpdates: "externalOnly" } });
  } catch (e) {
    if (!(e instanceof GoogleError) || (e.status !== 404 && e.status !== 410)) throw e;
  }
}
