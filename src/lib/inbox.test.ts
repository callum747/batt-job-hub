/**
 * The inbox, against a throwaway database, a pretend Gmail and a pretend assistant.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const parsed: { output: unknown; seen: string } = { output: null, seen: "" };
vi.mock("./assistant/client", () => ({
  MODEL: "test-model",
  explainAiError: (e: unknown) => String(e),
  anthropic: () => ({
    messages: {
      parse: async (p: { messages: { content: string }[] }) => {
        parsed.seen = p.messages[0].content;
        return { stop_reason: "end_turn", parsed_output: parsed.output };
      },
    },
  }),
}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = "office@battelectrical.com";
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const at = (day: number) => String(Date.UTC(2026, 10, day));
const hdr = (subject: string, from: string) => [{ name: "Subject", value: subject }, { name: "From", value: from }];

d("the inbox", () => {
  let sql: ReturnType<typeof postgres>;
  let inbox: typeof import("./inbox");
  let gmail: typeof import("./google/gmail");
  let lastQuery = "";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const threads: Record<string, { messages: unknown[] }> = {
    enq: { messages: [{ id: "1", internalDate: at(22), snippet: "Could you quote", payload: { headers: hdr("Rewire quote please", "Pat Example <pat@example.com>"), mimeType: "multipart/alternative", parts: [
      { mimeType: "text/plain", body: { data: b64("Hi, could you quote to rewire 4 Oak Road, HP20 1AA? Needed by 5th December. Pat, 07700 900000") } },
      { mimeType: "text/html", body: { data: b64("<p>ignored</p>") } },
      { mimeType: "application/pdf", filename: "plans.pdf", body: { size: 10 } },
    ] } }] },
    filed: { messages: [{ id: "2", internalDate: at(21), snippet: "re 558", payload: { headers: hdr("Re: Quotation 558 – Kitchen", "Sam <sam@example.org>") } }] },
    html: { messages: [{ id: "3", internalDate: at(20), snippet: "hello", payload: { headers: hdr("Socket", "Test Co <ops@testco.example>"), mimeType: "text/html", body: { data: b64("<div>Can you add&nbsp;a socket?<br>Thanks</div><style>p{}</style>") } } }] },
  };

  const fakeGoogle = async (input: string | URL | Request) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    if (u.pathname.endsWith("/threads")) {
      lastQuery = u.searchParams.get("q") ?? "";
      return json({ threads: Object.keys(threads).map((id) => ({ id })) });
    }
    const id = u.pathname.match(/\/threads\/(\w+)$/)?.[1];
    if (id && threads[id]) return json({ id, ...threads[id] });
    return json({ error: { message: "unexpected" } }, 500);
  };

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    process.env.NEXTAUTH_SECRET = "test-secret";
    vi.stubGlobal("fetch", vi.fn(fakeGoogle));
    const client = await import("./google/client");
    inbox = await import("./inbox");
    gmail = await import("./google/gmail");
    sql = (await import("./db")).sql;
    await client.saveRefreshToken(ME, "r", client.GOOGLE_SCOPES.join(" "));
    const [c] = await sql`insert into clients (name, email) values ('Test Co', 'ops@testco.example') returning id`;
    await sql`insert into jobs (number, stage, site, client_id) values (558, 'Quoted', '1 Test Street', ${c.id})`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("reads plain text, or HTML with the tags taken out, and lists attachments", () => {
    const t = gmail.messageText((threads.enq.messages[0] as { payload: never }).payload);
    expect(t.text).toContain("rewire 4 Oak Road, HP20 1AA");
    expect(t.attachments).toEqual(["plans.pdf"]);
    const h = gmail.messageText((threads.html.messages[0] as { payload: never }).payload);
    expect(h.text).toBe("Can you add a socket?\nThanks");
  });

  it("lists outside emails not on a job, newest first, and spots a client with an open job", async () => {
    const items = await inbox.listInbox(ME);
    expect(lastQuery).toContain("in:inbox newer_than:30d");
    expect(lastQuery).toContain("-from:battelectrical.com");
    // "Re: Quotation 558" is already on job 558, so it isn't listed.
    expect(items.map((i) => i.threadId)).toEqual(["enq", "html"]);
    expect(items[0]).toMatchObject({ from: "Pat Example", fromEmail: "pat@example.com", maybeJob: null });
    expect(items[1].maybeJob).toEqual({ ref: "558", label: "#558 for Test Co, 1 Test Street" });
  });

  it("drafts a job from the email, filling the sender's address if the email gave none", async () => {
    parsed.output = { is_job_enquiry: true, client_name: "Pat Example", contact_name: "Pat", contact_email: "", contact_phone: "07700 900000", site: "4 Oak Road", postcode: "HP20 1AA", type: "Install", description: "Full rewire.", deadline: "5th Dec", missing: ["Size of the house"] };
    const r = await inbox.proposeJob(ME, "enq");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.contact_email).toBe("pat@example.com");
    expect(r.proposal.deadline).toBe(""); // not a real date, so dropped rather than guessed
    expect(parsed.seen).toContain("attachments: plans.pdf");
    expect(parsed.seen).toContain("Subject: Rewire quote please");
  });

  it("makes the job and the client, links the email, and takes it out of the inbox", async () => {
    const id = await inbox.createJobFromEmail({ email: ME, name: "Office" }, "enq", {
      client_name: "Pat Example", contact_name: "Pat", contact_email: "Pat@Example.com", contact_phone: "07700 900000",
      site: "4 Oak Road", postcode: "hp20 1aa", type: "Install", description: "Full rewire.", deadline: "2026-12-05", subject: "Rewire quote please",
    });
    const [job] = await sql`select j.stage, j.postcode, j.deadline, j.contact, j.notes, c.email from jobs j join clients c on c.id = j.client_id where j.id = ${id}`;
    expect(job).toMatchObject({ stage: "Enquiry", postcode: "HP20 1AA", deadline: "2026-12-05", contact: "Pat, 07700 900000, Pat@Example.com", email: "pat@example.com" });
    expect(job.notes).toMatch(/Office: made from the email "Rewire quote please"\.$/);
    expect(await inbox.linkedThreads(id)).toEqual([{ mailbox: ME, threadId: "enq" }]);
    expect((await inbox.listInbox(ME)).map((i) => i.threadId)).toEqual(["html"]);
  });

  it("keeps an existing client's details when a job is made for them", async () => {
    await inbox.createJobFromEmail({ email: ME, name: "Office" }, "x1", { client_name: "Test Co", contact_name: "Someone", contact_email: "new@testco.example", contact_phone: "", site: "Depot", postcode: "", type: "Survey", description: "", deadline: "", subject: "s" });
    const [c] = await sql`select email from clients where name = 'Test Co'`;
    expect(c.email).toBe("ops@testco.example");
  });

  it("links an email to a job, or clears it, and both leave the inbox", async () => {
    const job = await inbox.linkEmailToJob({ email: ME }, "html", "#558");
    expect(job.number).toBe(558);
    await expect(inbox.linkEmailToJob({ email: ME }, "html", "999")).rejects.toThrow("There's no job 999.");
    expect(await inbox.listInbox(ME)).toEqual([]);
    await sql`delete from job_threads where thread_id = 'html'`;
    await inbox.hideEmail({ email: ME }, "html");
    expect(await inbox.listInbox(ME)).toEqual([]);
  });
});
