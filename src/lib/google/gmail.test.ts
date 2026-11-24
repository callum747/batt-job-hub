/**
 * Gmail drafts and a job's threads, against a throwaway database and a pretend Google.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const CALLUM = "callum@example.com";
const CAM = "cameron@example.com";
const OLD = "old@example.com";

type Call = { method: string; path: string; who: string; query: URLSearchParams; body: Record<string, unknown> | null };

d("Gmail", () => {
  let sql: ReturnType<typeof postgres>;
  let gmail: typeof import("./gmail");
  let qe: typeof import("../quote-email");
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fakeGoogle = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") {
      const rt = new URLSearchParams(String(init?.body)).get("refresh_token");
      return json({ access_token: `tok-${rt}`, expires_in: 3600 });
    }
    const who = (init?.headers as Record<string, string>).authorization.replace("Bearer tok-", "");
    const method = init?.method ?? "GET";
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, path: u.pathname, who, query: u.searchParams, body });
    if (u.pathname === "/drive/v3/files/pdf1") return new Response("%PDF-1.7 quote", { status: 200 });
    if (u.pathname === "/gmail/v1/users/me/drafts" && method === "POST") return json({ id: "d1", message: { id: "m1" } });
    if (u.pathname === "/gmail/v1/users/me/threads") return json({ threads: who === "callum" ? [{ id: "t1" }] : [{ id: "t2" }] });
    const t = u.pathname.match(/\/threads\/(t\d)$/)?.[1];
    if (t) {
      const h = (subject: string, from: string) => ({ headers: [{ name: "Subject", value: subject }, { name: "From", value: from }] });
      return t === "t1"
        ? json({ id: "t1", messages: [
            { id: "a", internalDate: String(Date.UTC(2026, 10, 20)), snippet: "first", payload: h("Quotation 559 – Rewire", "Callum <callum@example.com>") },
            { id: "b", internalDate: String(Date.UTC(2026, 10, 22)), snippet: "We&#39;d like to go ahead", payload: h("Re: Quotation 559 – Rewire", '"John Smith" <john@client.com>') },
          ] })
        : json({ id: "t2", messages: [{ id: "c", internalDate: String(Date.UTC(2026, 10, 21)), snippet: "site visit", payload: h("559 access", "Cam <cameron@example.com>") }] });
    }
    return json({ error: { message: `unexpected ${method} ${u.pathname}` } }, 500);
  };

  let jobId = "";
  let docId = "";

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
    gmail = await import("./gmail");
    qe = await import("../quote-email");
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(CALLUM, "callum", client.GOOGLE_SCOPES.join(" "));
    await client.saveRefreshToken(CAM, "cam", client.GOOGLE_SCOPES.join(" "));
    // Connected before Gmail was added: Drive and Calendar only.
    await client.saveRefreshToken(OLD, "old", client.GOOGLE_SCOPES.slice(0, 5).join(" "));
    await sql`update people set email = ${CALLUM} where short_name = 'Callum'`;
    const [c] = await sql`insert into clients (name, email, contact) values ('Smith Homes', 'john@client.com', 'John Smith') returning id`;
    const [j] = await sql`insert into jobs (number, stage, site, client_id, quote_draft) values (559, 'Quoted', '12 Test Lane', ${c.id},
      ${sql.json({ template: "quoteLong", number: 559, project: "Ground floor rewire", site: "12 Test Lane, Aylesbury", subtotal: 7300, vat: 1460, total: 8760 })}) returning id`;
    jobId = j.id;
    const [doc] = await sql`insert into documents (job_id, kind, revision, name, doc_id, url, pdf_file_id, pdf_url) values (${jobId}, 'quote', 1, '559 – Smith Homes – Quote', 'doc1', 'https://docs/doc1', 'pdf1', 'https://drive/pdf1') returning id`;
    docId = doc.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("knows who has given Gmail permission", async () => {
    const client = await import("./client");
    expect(await client.gmailConnected(CALLUM)).toBe(true);
    expect(await client.gmailConnected(OLD)).toBe(false);
    expect(await client.googleConnected(OLD)).toBe(true);
    expect(await client.gmailMailboxes()).toEqual([CALLUM, CAM]);
  });

  it("drafts the quote email to the client, from the last quote", async () => {
    const job = (await (await import("../data")).findJob("559"))!;
    const start = (await qe.quoteEmailStart(job, CALLUM))!;
    expect(start).toMatchObject({ documentId: docId, to: "john@client.com", subject: "Quotation #559 – Ground floor rewire", pdfName: "559 – Smith Homes – Quote.pdf" });
    expect(start.body).toContain("Hi John,");
    expect(start.body).toContain("£7,300.00 + VAT (£8,760.00 including VAT)");
    expect(start.body).toContain("Callum Blacknell\nProject Manager, Batt Electrical");
  });

  it("saves a draft with the PDF attached, and never sends", async () => {
    calls.length = 0;
    const r = await qe.draftQuoteEmail(jobId, docId, { to: "john@client.com", cc: "", subject: "Quotation 559 – Ground floor rewire", body: "Hi John" }, { email: CALLUM, name: "Callum" });
    expect(r).toMatchObject({ ok: true, url: "https://mail.google.com/mail/?authuser=callum%40example.com#drafts?compose=m1" });
    const draft = calls.find((c) => c.path.endsWith("/drafts"))!;
    expect(draft.who).toBe("callum");
    const mime = Buffer.from(String((draft.body!.message as { raw: string }).raw), "base64url").toString("utf8");
    expect(mime).toContain("To: john@client.com");
    expect(mime).toContain(Buffer.from("%PDF-1.7 quote").toString("base64"));
    expect(calls.some((c) => c.path.includes("/send"))).toBe(false);
    const [job] = await sql`select notes from jobs where id = ${jobId}`;
    expect(job.notes).toMatch(/Callum: quote email drafted in Gmail to john@client.com, not sent yet\.$/);
  });

  it("refuses someone without Gmail permission, and a bad address, in plain words", async () => {
    const noGmail = await qe.draftQuoteEmail(jobId, docId, { to: "john@client.com", cc: "", subject: "x", body: "y" }, { email: OLD, name: "Old" });
    expect(noGmail).toEqual({ ok: false, message: "Gmail isn't connected for you yet. Press Connect Google at the top of the page and tick the Gmail boxes." });
    const bad = await qe.draftQuoteEmail(jobId, docId, { to: "john", cc: "", subject: "x", body: "y" }, { email: CALLUM, name: "Callum" });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('"john" isn\'t an email address');
  });

  it("finds a job's threads in every connected mailbox, newest first, with links only to your own", async () => {
    const r = await gmail.jobThreads('{subject:(559)} newer_than:2y', CALLUM);
    expect(r.problems).toEqual([]);
    expect(r.threads.map((t) => [t.threadId, t.mailbox, t.subject, t.from, t.count, Boolean(t.url)])).toEqual([
      ["t1", CALLUM, "Quotation 559 – Rewire", "John Smith", 2, true],
      ["t2", CAM, "559 access", "Cam", 1, false],
    ]);
    expect(r.threads[0].snippet).toBe("We&#39;d like to go ahead");
    const asked = calls.filter((c) => c.path.endsWith("/threads"));
    expect(asked.every((c) => c.query.get("q") === '{subject:(559)} newer_than:2y')).toBe(true);
    expect(calls.find((c) => c.path.endsWith("/threads/t1"))!.query.getAll("metadataHeaders")).toEqual(["Subject", "From"]);
  });
});
