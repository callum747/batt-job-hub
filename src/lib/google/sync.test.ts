/**
 * Drive folders and calendar entries, against a real throwaway database and a pretend Google.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = "callum@example.com";

type Call = { method: string; path: string; query: Record<string, string>; body: Record<string, unknown> | null };
type F = { id: string; name: string; mimeType: string; parents: string[] };

d("Drive and Calendar sync", () => {
  let sql: ReturnType<typeof postgres>;
  let drive: typeof import("./drive");
  let calendar: typeof import("./calendar");
  let calls: Call[] = [];
  const files: F[] = [];
  const events: Record<string, { calendar: string; body: Record<string, unknown> }> = {};
  let n = 0;
  const T = { Live: "1FA7pYfN2RCerMXHRQwePGS3KDfPRhUpS", Lost: "1_5yE7283nhE4IfoagBCcykYquIaQwrFh", Active: "18LaO6Ug4v2_2UD9OTTrAO9uNMH6Mpjr_", Completed: "1JX2ZsJuppISjolwCWZxhpRIBk9GDlsE5" };
  const REAL_LIVE = "1nO9zd2wLMahtVCg4WKx9wxuCN7dK5R98";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fakeGoogle = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const query = Object.fromEntries(u.searchParams);
    calls.push({ method, path: u.pathname, query, body });
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    if (u.pathname === "/drive/v3/files" && method === "POST") {
      const f = { id: `f${++n}`, name: body.name, mimeType: body.mimeType, parents: body.parents };
      files.push(f);
      return json({ ...f, webViewLink: `https://drive.example/${f.id}` });
    }
    if (u.pathname === "/drive/v3/files" && method === "GET") {
      const parents = [...query.q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      const onlyFolders = query.q.includes("mimeType =");
      return json({ files: files.filter((f) => f.parents.some((p) => parents.includes(p)) && (!onlyFolders || f.mimeType.endsWith("folder"))) });
    }
    const fileId = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/)?.[1];
    if (fileId) {
      const f = files.find((x) => x.id === fileId);
      if (!f) return json({ error: { message: "File not found" } }, 404);
      if (method === "PATCH") f.parents = [query.addParents];
      return json(f);
    }
    if (u.pathname === "/calendar/v3/calendars" && method === "POST") return json({ id: "testcal@group" });
    const ev = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/(.+))?$/);
    if (ev) {
      const [, calId, id] = ev;
      if (method === "POST") {
        const newId = `e${++n}`;
        events[newId] = { calendar: decodeURIComponent(calId), body };
        return json({ id: newId, htmlLink: `https://cal.example/${newId}` });
      }
      if (!events[id]) return json({ error: { message: "Not Found" } }, 404);
      if (method === "DELETE") {
        delete events[id];
        return new Response(null, { status: 204 });
      }
      events[id].body = body;
      return json({ id, htmlLink: `https://cal.example/${id}` });
    }
    return json({ error: { message: `unexpected ${method} ${u.pathname}` } }, 500);
  };

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    process.env.NEXTAUTH_SECRET = "test-secret";
    vi.stubGlobal("fetch", vi.fn(fakeGoogle));
    const client = await import("./client");
    drive = await import("./drive");
    calendar = await import("./calendar");
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(ME, "refresh-abc", client.GOOGLE_SCOPES.join(" "));
    await sql`update people set email = 'callum@example.com' where short_name = 'Callum'`;
  });
  beforeEach(() => {
    calls = [];
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("stores the Google permission encrypted, not in plain text", async () => {
    const [row] = await sql`select refresh_token_enc from google_tokens where email = ${ME}`;
    expect(row.refresh_token_enc).not.toContain("refresh-abc");
    const { googleConnected } = await import("./client");
    expect(await googleConnected(ME)).toBe(true);
    expect(await googleConnected("someone@example.com")).toBe(false);
  });

  it("does nothing for a job with no number", async () => {
    const [j] = await sql`insert into jobs (stage, site) values ('Enquiry', 'Somewhere') returning id`;
    expect(await drive.syncJobFolder(j.id, ME)).toBe("");
    expect(calls).toHaveLength(0);
  });

  let jobId = "";
  it("creates the folder and its eight subfolders in the test Live folder", async () => {
    const [c] = await sql`insert into clients (name) values ('Meterz') returning id`;
    const [j] = await sql`insert into jobs (number, stage, site, client_id) values (557, 'Draft quote', '1 Finsbury Circus', ${c.id}) returning id`;
    jobId = j.id;
    const msg = await drive.syncJobFolder(jobId, ME);
    expect(msg).toBe("Drive folder created in Live (test folder).");
    const folder = files.find((f) => f.name === "#557 – Meterz – 1 Finsbury Circus")!;
    expect(folder.parents).toEqual([T.Live]);
    expect(files.filter((f) => f.parents[0] === folder.id).map((f) => f.name)).toEqual([
      "01 - Quote & Contract", "02 - Drawings & Specs", "03 - RAMS & Site H&S", "04 - Procurement",
      "05 - Variations", "06 - Site Photos", "07 - Testing & Certificates", "08 - Handover & O&M", "09 - Surveys",
    ]);
    const [row] = await sql`select drive_folder_id, drive_folder_url, drive_error from jobs where id = ${jobId}`;
    expect(row.drive_folder_id).toBe(folder.id);
    expect(row.drive_folder_url).toContain(folder.id);
    expect(calls.every((c) => c.query.supportsAllDrives === "true")).toBe(true);
  });

  it("moves the folder when the stage changes, and not when it doesn't need to", async () => {
    await sql`update jobs set stage = 'Booked' where id = ${jobId}`;
    expect(await drive.syncJobFolder(jobId, ME)).toBe("Drive folder moved to Active (test folder).");
    expect(files.find((f) => f.name.startsWith("#557 "))!.parents).toEqual([T.Active]);
    await sql`update jobs set stage = 'In progress' where id = ${jobId}`;
    expect(await drive.syncJobFolder(jobId, ME)).toBe("");
    await sql`update jobs set stage = 'On hold' where id = ${jobId}`;
    expect(await drive.syncJobFolder(jobId, ME)).toBe("");
    await sql`update jobs set stage = 'Paid' where id = ${jobId}`;
    expect(await drive.syncJobFolder(jobId, ME)).toContain("moved to Completed");
    await sql`update jobs set stage = 'Lost' where id = ${jobId}`;
    expect(await drive.syncJobFolder(jobId, ME)).toContain("moved to Lost");
  });

  it("never moves a real folder while in test mode", async () => {
    files.push({ id: "real1", name: "Q-556 – Meterz – Finsbury", mimeType: "application/vnd.google-apps.folder", parents: [REAL_LIVE] });
    const [j] = await sql`insert into jobs (number, stage, site, drive_folder_id) values (556, 'Booked', 'Finsbury', 'real1') returning id`;
    expect(await drive.syncJobFolder(j.id, ME)).toBe("Drive folder left where it is, because the app is in test mode.");
    expect(files.find((f) => f.id === "real1")!.parents).toEqual([REAL_LIVE]);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("links a folder that's already there instead of making a second one, and fills in missing subfolders", async () => {
    files.push({ id: "half", name: "558 – Half made", mimeType: "application/vnd.google-apps.folder", parents: [T.Live] });
    files.push({ id: "half1", name: "01 - Quote & Contract", mimeType: "application/vnd.google-apps.folder", parents: ["half"] });
    const [j] = await sql`insert into jobs (number, stage, site) values (558, 'Quoted', 'Half made') returning id`;
    expect(await drive.syncJobFolder(j.id, ME)).toBe("Drive folder linked in Live (test folder).");
    expect(files.filter((f) => f.parents[0] === "half")).toHaveLength(9);
    expect(files.filter((f) => f.name.startsWith("558 "))).toHaveLength(1);
  });

  it("saves the problem on the job when Google refuses", async () => {
    const [j] = await sql`insert into jobs (number, stage, site, drive_folder_id) values (559, 'Booked', 'Gone', 'missing') returning id`;
    const msg = await drive.syncJobFolder(j.id, ME);
    expect(msg).toContain("Drive folder not updated");
    const [row] = await sql`select drive_error from jobs where id = ${j.id}`;
    expect(row.drive_error).toContain("couldn't find");
  });

  it("lists a job folder's files by subfolder", async () => {
    const folder = files.find((f) => f.name.startsWith("#557 "))!;
    const sub = files.find((f) => f.parents[0] === folder.id && f.name.startsWith("01"))!;
    files.push({ id: "pdf1", name: "557 – Quote.pdf", mimeType: "application/pdf", parents: [sub.id] });
    const listing = await drive.listJobFiles(ME, folder.id);
    expect(listing).toHaveLength(9);
    expect(listing[0].files.map((f) => f.name)).toEqual(["557 – Quote.pdf"]);
  });

  let visitId = "";
  it("makes the test calendar once, then puts a visit in it and invites people with an email", async () => {
    const people = await sql`select id, short_name from people`;
    const [v] = await sql`insert into visits (job_id, date, work) values (${jobId}, '2026-12-01', 'First fix') returning id`;
    visitId = v.id;
    for (const p of people.filter((p) => p.short_name !== "Cam")) await sql`insert into visit_people (visit_id, person_id) values (${visitId}, ${p.id})`;
    const msg = await calendar.syncVisit(visitId, ME);
    expect(msg).toBe("In the calendar, but Jed can't be invited until their email is added in Settings.");
    const [row] = await sql`select calendar_event_id, calendar_id, calendar_link from visits where id = ${visitId}`;
    expect(row.calendar_id).toBe("testcal@group");
    const ev = events[row.calendar_event_id];
    expect(ev.calendar).toBe("testcal@group");
    expect(ev.body.summary).toBe("#557 Meterz – First fix (Callum, Jed)");
    expect(ev.body.attendees).toEqual([{ email: "callum@example.com" }]);
    expect(ev.body.start).toEqual({ date: "2026-12-01" });
    expect(calls.filter((c) => c.path === "/calendar/v3/calendars")).toHaveLength(1);
    expect(calls.find((c) => c.path.endsWith("/events"))!.query.sendUpdates).toBe("externalOnly");
  });

  it("updates the same entry when the visit changes, without making another calendar or entry", async () => {
    await sql`update visits set date = '2026-12-02', start_time = '08:00', end_time = '12:00' where id = ${visitId}`;
    await calendar.syncVisit(visitId, ME);
    expect(Object.keys(events)).toHaveLength(1);
    expect(Object.values(events)[0].body.start).toEqual({ dateTime: "2026-12-02T08:00:00", timeZone: "Europe/London" });
    expect(calls.some((c) => c.path === "/calendar/v3/calendars")).toBe(false);
  });

  it("leaves entries on the real calendar alone while in test mode", async () => {
    const [v] = await sql`insert into visits (date, work, calendar_event_id, calendar_id) values ('2027-01-23', 'Install', 'realevent', 'real@group.calendar.google.com') returning id`;
    const msg = await calendar.syncVisit(v.id, ME);
    expect(msg).toContain("Calendar not updated");
    expect(calls).toHaveLength(0);
    await calendar.removeVisitEvent({ calendar_event_id: "realevent", calendar_id: "real@group.calendar.google.com" }, ME);
    expect(calls).toHaveLength(0);
  });

  it("removes a visit's entry from the calendar", async () => {
    const [row] = await sql`select calendar_event_id, calendar_id from visits where id = ${visitId}`;
    await calendar.removeVisitEvent(row as never, ME);
    expect(Object.keys(events)).toHaveLength(0);
  });

  it("tells someone who hasn't connected Google what to do", async () => {
    const [v] = await sql`insert into visits (date, work) values ('2026-12-05', 'Survey') returning id`;
    const msg = await calendar.syncVisit(v.id, "new@example.com");
    expect(msg).toContain("Open Settings and press Connect Google");
    const [row] = await sql`select calendar_error from visits where id = ${v.id}`;
    expect(row.calendar_error).toContain("Connect Google");
  });
});
