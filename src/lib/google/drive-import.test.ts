/**
 * Job folders made by hand in Drive become jobs, against a throwaway database and a pretend Drive.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = "office@battelectrical.com";
// The test-mode folders from the settings.
const T = { Live: "1FA7pYfN2RCerMXHRQwePGS3KDfPRhUpS", Lost: "1_5yE7283nhE4IfoagBCcykYquIaQwrFh", Active: "18LaO6Ug4v2_2UD9OTTrAO9uNMH6Mpjr_", Completed: "1JX2ZsJuppISjolwCWZxhpRIBk9GDlsE5" };

d("Drive folders made by hand", () => {
  let sql: ReturnType<typeof postgres>;
  let di: typeof import("./drive-import");
  const folders = [
    { id: "f560", name: "560 – Smith Homes – 4 Oak Road, Aylesbury", parent: T.Live },
    { id: "f558", name: "558 - Test Co - Depot", parent: T.Active },
    { id: "f557b", name: "557 – Someone – Elsewhere", parent: T.Live },
    { id: "f557", name: "557 – Test Co – Linked already", parent: T.Live },
    { id: "ftpl", name: "00 - Templates", parent: T.Live },
    { id: "f540", name: "540 – Old Client", parent: T.Lost },
  ];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const fakeGoogle = async (input: string | URL | Request) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    if (u.pathname === "/drive/v3/files") {
      const parents = [...u.searchParams.get("q")!.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      return json({ files: folders.filter((f) => parents.includes(f.parent)).map((f) => ({ id: f.id, name: f.name, mimeType: "application/vnd.google-apps.folder", webViewLink: `https://drive/${f.id}` })) });
    }
    return json({});
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
    di = await import("./drive-import");
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(ME, "r", client.GOOGLE_SCOPES.join(" "));
    const [c] = await sql`insert into clients (name) values ('Test Co') returning id`;
    await sql`insert into jobs (number, stage, site, client_id) values (558, 'Booked', 'Depot', ${c.id})`;
    await sql`insert into jobs (number, stage, site, client_id, drive_folder_id) values (557, 'Quoted', 'x', ${c.id}, 'f557')`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("makes jobs from new folders, links a folder to its job, and flags a clash", async () => {
    const r = await di.importDriveFolders(ME);
    expect(r.created.sort()).toEqual(["540 – Old Client", "560 – Smith Homes – 4 Oak Road, Aylesbury"]);
    expect(r.linked).toEqual(["558 - Test Co - Depot"]);
    expect(r.clashes).toEqual(["557 – Someone – Elsewhere (job #557 already has a different folder)"]);
    const jobs = await sql`select j.number, j.stage, j.site, c.name as client, j.drive_folder_id from jobs j left join clients c on c.id = j.client_id where j.number not in (506, 526, 531) order by j.number`;
    expect(jobs.map((j) => ({ ...j }))).toEqual([
      { number: 540, stage: "Lost", site: "", client: "Old Client", drive_folder_id: "f540" },
      { number: 557, stage: "Quoted", site: "x", client: "Test Co", drive_folder_id: "f557" },
      { number: 558, stage: "Booked", site: "Depot", client: "Test Co", drive_folder_id: "f558" },
      { number: 560, stage: "Draft quote", site: "4 Oak Road, Aylesbury", client: "Smith Homes", drive_folder_id: "f560" },
    ]);
  });

  it("checks at most every 10 minutes unless forced, and doesn't make a job twice", async () => {
    expect((await di.importDriveFolders(ME)).message).toBe("Checked recently.");
    const again = await di.importDriveFolders(ME, { force: true });
    expect(again.created).toEqual([]);
  });

  it("follows folders moved or renamed by hand, but changes nothing on the first look", async () => {
    // 558 was linked on the first look; it's in Active and the job is Booked. Moving it to Completed marks it Paid.
    folders.find((f) => f.id === "f558")!.parent = T.Completed;
    // 560 renamed by hand: new site.
    folders.find((f) => f.id === "f560")!.name = "#560 – Smith Homes – 6 Oak Road, Aylesbury";
    // 557 (linked from the start, never seen before): just remembered, even though it's in Live and the job is Quoted.
    const r = await di.importDriveFolders(ME, { force: true });
    expect(r.updated.sort()).toEqual(['#558 moved to Paid', '#560 renamed to "#560 – Smith Homes – 6 Oak Road, Aylesbury"']);
    const rows = await sql`select number, stage, site, drive_folder_area from jobs where number in (557, 558, 560) order by number`;
    expect(rows.map((j) => ({ ...j }))).toEqual([
      { number: 557, stage: "Quoted", site: "x", drive_folder_area: "Live" },
      { number: 558, stage: "Paid", site: "Depot", drive_folder_area: "Completed" },
      { number: 560, stage: "Draft quote", site: "6 Oak Road, Aylesbury", drive_folder_area: "Live" },
    ]);
    // Q-552 becoming #552 (or 560 becoming #560) is only a new prefix: nothing changes.
    folders.find((f) => f.id === "f560")!.name = "560 - Smith Homes - 6 Oak Road, Aylesbury";
    expect((await di.importDriveFolders(ME, { force: true })).updated).toEqual([]);
  });

  it("finds job folders inside year folders in Completed", async () => {
    folders.push({ id: "y2026", name: "2026", parent: T.Completed }, { id: "f530", name: "#530 – Archive Client – Old Site", parent: "y2026" });
    const r = await di.importDriveFolders(ME, { force: true });
    expect(r.created).toEqual(["#530 – Archive Client – Old Site"]);
    const [j] = await sql`select stage from jobs where number = 530`;
    expect(j.stage).toBe("Paid");
  });

  it("never gives out a number already used by a folder made by hand", async () => {
    folders.push({ id: "f561", name: "561 – Hand Made – Somewhere", parent: T.Live });
    const [j] = await sql`insert into jobs (stage, site) values ('Enquiry', 'New one') returning id`;
    const { changeStage } = await import("../mutations");
    const r = await changeStage(j.id, "Draft quote", ME);
    expect(r.number).toBe(562);
    const [hand] = await sql`select stage from jobs where number = 561`;
    expect(hand.stage).toBe("Draft quote");
  });
});
