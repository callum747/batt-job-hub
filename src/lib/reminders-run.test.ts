/**
 * Chasing quotes against a throwaway database, with Gmail and Drive faked.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const drafts: { to: string; subject: string; body: string; attachments: { name: string }[] }[] = [];
vi.mock("./google/gmail", () => ({
  createDraft: vi.fn(async (_from: string, d: (typeof drafts)[number]) => {
    drafts.push(d);
    return { draftId: "d1", messageId: "m1", url: "https://mail/draft" };
  }),
  driveFileBytes: vi.fn(async () => Buffer.from("PDF")),
}));
vi.mock("./google/client", () => ({ errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)), googleSettings: async () => ({ mode: "test" }) }));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = { email: "office@battelectrical.com", name: "Office" };

d("chasing quotes", () => {
  let sql: ReturnType<typeof postgres>;
  let r: typeof import("./reminders-run");
  let data: typeof import("./data");
  let jobId = "";

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    sql = (await import("./db")).sql;
    r = await import("./reminders-run");
    data = await import("./data");
    const [c] = await sql`insert into clients (name, contact, email) values ('Example Homes', 'Sam Carter', 'sam@example.com') returning id`;
    const [j] = await sql`insert into jobs (number, client_id, site, stage, quote_value, quoted_at, quote_draft)
      values (601, ${c.id}, '4 Test Lane', 'Quoted', 1250, current_date - 9, ${sql.json({ template: "quoteShort", number: 601, project: "Garage lighting", site: "4 Test Lane", subtotal: 1250, total: 1500 })}) returning id`;
    jobId = j.id;
    await sql`insert into documents (job_id, kind, revision, name, doc_id, url, pdf_file_id, pdf_url) values (${jobId}, 'quote', 1, '#601/1 – 4 Test Lane – Quote', 'doc', 'https://doc', 'pdf', 'https://pdf')`;
    await sql`insert into jobs (number, site, stage, quote_value, quoted_at) values (602, 'Sent yesterday', 'Quoted', 500, current_date - 1)`;
    await sql`insert into jobs (number, site, stage, updated_at) values (603, 'Done, not invoiced', 'Complete', now() - interval '5 days')`;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("lists the quote that's a week old, not yesterday's, and the job that's stalled", async () => {
    const jobs = await data.listJobs();
    expect((await r.quoteReminders(jobs)).map((q) => [q.label, q.client, q.daysSinceSent, q.chases])).toEqual([["#601", "Example Homes", 9, 0]]);
    expect((await r.stuckReminders(jobs)).map((s) => [s.label, s.why])).toEqual([["#603", "Finished 5 days ago and not invoiced."]]);
  });

  it("drafts the chaser to the client with the quote attached, notes it, and waits a week before the next", async () => {
    const out = await r.draftQuoteChaser(jobId, ME);
    expect(out).toMatchObject({ ok: true, url: "https://mail/draft" });
    expect(out.message).toBe("Chaser 1 saved in your Gmail drafts to sam@example.com, with the quote attached. Check it and press Send. The next chase is in a week.");
    expect(drafts[0]).toMatchObject({ to: "sam@example.com", subject: "Re: Quotation #601/1 – Garage lighting", attachments: [{ name: "#601-1 – 4 Test Lane – Quote.pdf" }] });
    expect(drafts[0].body).toMatch(/^Hi Sam,\n\nDid our quotation #601\/1 for Garage lighting at 4 Test Lane reach you safely\?/);
    const [j] = await sql`select quote_chases, quote_chased_at = current_date as today, notes from jobs where id = ${jobId}`;
    expect(j).toMatchObject({ quote_chases: 1, today: true });
    expect(j.notes).toMatch(/quote chased \(chaser 1 drafted in Gmail to sam@example.com, not sent yet\)\.$/);
    expect(await r.quoteReminders(await data.listJobs())).toEqual([]);
  });

  it("steps the wording up next time, and won't chase a job that isn't waiting on a quote", async () => {
    await sql`update jobs set quote_chased_at = current_date - 7 where id = ${jobId}`;
    expect((await r.quoteReminders(await data.listJobs())).map((q) => q.chases)).toEqual([1]);
    await r.draftQuoteChaser(jobId, ME);
    expect(drafts[1].body).toContain("Are you still looking to go ahead?");
    expect((await r.draftQuoteChaser("603", ME)).message).toBe("#603 is at Complete, so there's no quote waiting on an answer.");
  });

  it("gives a job its sent date the day it becomes Quoted", async () => {
    const { changeStage } = await import("./mutations");
    const [j] = await sql`insert into jobs (number, site, stage) values (604, 'New', 'Draft quote') returning id`;
    await changeStage(j.id, "Quoted", "tester");
    expect((await sql`select quoted_at is not null as set from jobs where id = ${j.id}`)[0].set).toBe(true);
  });
});
