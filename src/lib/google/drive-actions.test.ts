/**
 * The assistant moving, renaming and binning things in Drive, against a pretend Drive and a throwaway database.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = { email: "office@battelectrical.com" };
const F = "application/vnd.google-apps.folder";
const LIVE = "1nO9zd2wLMahtVCg4WKx9wxuCN7dK5R98";
const TEMPLATE = "11Od3EnGYK4KM-iaVXFTBznJTD0V89fEdxyFgr6vsUSI";

type Item = { id: string; name: string; mimeType: string; parents: string[]; driveId?: string; trashed?: boolean };
const drive = new Map<string, Item>();
const put = (id: string, name: string, parent: string, mimeType = F, driveId: string | undefined = "DRIVE") => drive.set(id, { id, name, mimeType, parents: [parent], driveId });

vi.mock("./job-files", () => ({ listAllJobFiles: vi.fn(async (_e: string, id: string) => ({ files: [...drive.values()].filter((f) => f.parents[0] === id).map((f) => ({ name: f.name })), more: false })) }));
vi.mock("./client", () => ({
  GoogleError: class extends Error {},
  googleSettings: async () => (await (await import("../db")).sql`select value from settings where key = 'google'`)[0].value,
  google: vi.fn(async (_e: string, p: string, opts: { method?: string; query?: Record<string, string>; body?: { name?: string; trashed?: boolean } } = {}) => {
    if (p === "/drive/v3/files") {
      const words = [...(opts.query!.q as string).matchAll(/name contains '([^']+)'/g)].map((m) => m[1].toLowerCase());
      return { files: [...drive.values()].filter((f) => !f.trashed && words.every((w) => f.name.toLowerCase().includes(w))) };
    }
    const f = drive.get(decodeURIComponent(p.split("/").pop()!));
    if (!f) throw new Error("not found");
    if (opts.method === "PATCH") {
      if (opts.query?.addParents) f.parents = [opts.query.addParents];
      if (opts.body?.name) f.name = opts.body.name;
      if (opts.body?.trashed) f.trashed = true;
    }
    return f;
  }),
}));

d("the assistant in Drive", () => {
  let sql: ReturnType<typeof postgres>;
  let a: typeof import("./drive-actions");

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    sql = (await import("../db")).sql;
    await sql`update settings set value = jsonb_set(value, '{mode}', '"live"') where key = 'google'`;
    a = await import("./drive-actions");
    put("top", "Enquiries & Tenders", "DRIVE");
    put(LIVE, "01 - Live", "top");
    put("arch", "Archive", "DRIVE");
    put("july", "July 26", "arch");
    put("f526", "19 Back Street - Caswell - Q-526", "july");
    put("q526", "19 Back Street - Q-526.pdf", "f526", "application/pdf");
    put(TEMPLATE, "Pricing template", "top", "application/vnd.google-apps.spreadsheet");
    drive.set("mine", { id: "mine", name: "My own file", mimeType: "application/pdf", parents: ["root"] });
    put("jobf", "#560 – A – B", LIVE);
    await sql`insert into jobs (number, stage, site, drive_folder_id) values (560, 'Quoted', 'B', 'jobf')`;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("finds things by name and says where they are", async () => {
    expect(await a.driveFind(ME.email, "back street")).toMatchObject([
      { id: "f526", kind: "folder", where: "Archive › July 26" },
      { id: "q526", kind: "file", where: "Archive › July 26 › 19 Back Street - Caswell - Q-526" },
    ]);
  });

  it("moves a folder out of the archive into Live and renames it, with both in the audit log", async () => {
    expect(await a.driveMove(ME, "f526", { area: "Live" })).toMatchObject({ moved: true, from: "Archive › July 26", to: "Enquiries & Tenders › 01 - Live" });
    expect(drive.get("f526")!.parents).toEqual([LIVE]);
    expect(await a.driveRename(ME, "f526", "#526 – Caswell – 19 Back Street")).toMatchObject({ renamed: true });
    const log = await sql`select action from audit_log where entity = 'drive' order by at`;
    expect(log.map((r) => r.action)).toEqual(["Drive: moved (assistant)", "Drive: renamed (assistant)"]);
  });

  it("won't touch the top-level folders, the stage folders, a template, or anything outside the shared drive", async () => {
    await expect(a.driveMove(ME, "arch", { area: "Live" })).rejects.toThrow("top-level folder");
    await expect(a.driveRename(ME, LIVE, "x")).rejects.toThrow("the app depends on");
    await expect(a.driveBin(ME, TEMPLATE, { userText: "yes", startedAt: new Date() })).rejects.toThrow("the app depends on");
    await expect(a.driveMove(ME, "mine", { area: "Live" })).rejects.toThrow("isn't in Batt's shared drive");
    await expect(a.driveMove(ME, "top", { folderId: "f526" })).rejects.toThrow();
  });

  it("only bins after being told what will go and the person's own yes in a later message", async () => {
    const first = await a.driveBin(ME, "july", { userText: "bin the July 26 folder, yes do it", startedAt: new Date() });
    expect(first).toMatchObject({ binned: false, waiting_for_yes: true, would_bin: { name: "July 26", kind: "folder", in: "Archive" } });
    expect(drive.get("july")!.trashed).toBeFalsy();
    // Asking again in the same turn, or a later turn that doesn't say yes, still does nothing.
    expect((await a.driveBin(ME, "july", { userText: "yes", startedAt: new Date(Date.now() - 60_000) })).binned).toBe(false);
    expect((await a.driveBin(ME, "july", { userText: "hmm, what's in it?", startedAt: new Date(Date.now() + 1000) })).binned).toBe(false);
    expect((await a.driveBin(ME, "july", { userText: "no don't do it", startedAt: new Date(Date.now() + 1000) })).binned).toBe(false);
    const done = await a.driveBin(ME, "july", { userText: "Yes go ahead", startedAt: new Date(Date.now() + 1000) });
    expect(done).toMatchObject({ binned: true, name: "July 26" });
    expect(drive.get("july")!.trashed).toBe(true);
  });

  it("won't bin the folder of a job that's in the app", async () => {
    await expect(a.driveBin(ME, "jobf", { userText: "yes", startedAt: new Date() })).rejects.toThrow("is the Drive folder of job #560");
  });
});
