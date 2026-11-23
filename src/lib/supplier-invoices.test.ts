/**
 * Supplier invoices end to end, against a throwaway database, a pretend Gmail and a pretend assistant.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// What the pretend assistant "reads" in each PDF, keyed by the PDF's text.
const readings: Record<string, unknown> = {};
vi.mock("./assistant/client", () => ({
  MODEL: "test-model",
  assistantConfigured: () => true,
  explainAiError: (e: unknown) => String(e),
  anthropic: () => ({
    messages: {
      parse: async (p: { messages: { content: { type: string; source?: { data: string } }[] }[] }) => {
        const pdf = Buffer.from(p.messages[0].content[0].source!.data, "base64").toString("utf8");
        return { stop_reason: "end_turn", parsed_output: readings[pdf] ?? null };
      },
    },
  }),
}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const BOX = "info@battelectrical.com";
const inv = (o: Record<string, unknown>) => ({
  is_invoice_or_credit_note: true, is_credit_note: false, addressed_to_batt: true, supplier: "CEF", invoice_number: "", invoice_date: "2026-11-20",
  net: 100, vat: 20, gross: 120, order_reference: "", job_numbers: [], ...o,
});

d("supplier invoices", () => {
  let sql: ReturnType<typeof postgres>;
  let si: typeof import("./supplier-invoices");
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const mails: Record<string, { subject: string; pdfs: [string, string][] }> = {
    m1: { subject: "CEF Invoice 9001", pdfs: [["9001.pdf", "pdf-9001"]] },
    m2: { subject: "CEF Quotation", pdfs: [["quote.pdf", "pdf-quote"]] },
    m3: { subject: "Invoice and credit", pdfs: [["9002.pdf", "pdf-9002"], ["cn1.pdf", "pdf-cn1"]] },
  };
  let listed: string[] = [];
  let lastQuery = "";

  const fakeGoogle = async (input: string | URL | Request) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    if (u.pathname.endsWith("/messages")) {
      lastQuery = u.searchParams.get("q") ?? "";
      return json({ messages: listed.map((id) => ({ id })) });
    }
    const att = u.pathname.match(/\/messages\/(\w+)\/attachments\/(.+)$/);
    if (att) return json({ data: Buffer.from(decodeURIComponent(att[2])).toString("base64url") });
    const id = u.pathname.match(/\/messages\/(\w+)$/)?.[1];
    if (id && mails[id]) {
      const m = mails[id];
      return json({
        internalDate: String(Date.UTC(2026, 10, 21)),
        payload: {
          headers: [{ name: "Subject", value: m.subject }, { name: "From", value: "CEF <invoices@supplier.example>" }],
          mimeType: "multipart/mixed",
          parts: [{ mimeType: "text/plain", body: { data: Buffer.from("see attached").toString("base64url") } }, ...m.pdfs.map(([name, text]) => ({ filename: name, mimeType: "application/pdf", body: { attachmentId: text } }))],
        },
      });
    }
    return json({ error: { message: `unexpected ${u.pathname}` } }, 500);
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
    si = await import("./supplier-invoices");
    sql = (await import("./db")).sql;
    await sql`insert into jobs (number, stage, site) values (552, 'In progress', 'Croydon'), (557, 'Booked', 'Aylesbury')`;
    readings["pdf-9001"] = inv({ invoice_number: "9001", net: 412.5, vat: 82.5, gross: 495, order_reference: "#552 CBRE CROYDEN" });
    readings["pdf-quote"] = inv({ is_invoice_or_credit_note: false });
    readings["pdf-9002"] = inv({ invoice_number: "9002", order_reference: "Van stock" });
    readings["pdf-cn1"] = inv({ invoice_number: "CN1", is_credit_note: true, net: 30, vat: 6, gross: 36, order_reference: "557" });
    listed = ["m1", "m2"];
    // Not connected yet.
    expect((await si.scanInvoices()).message).toContain("isn't connected");
    await client.saveRefreshToken(BOX, "r", client.GOOGLE_SCOPES.join(" "));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("files a clear invoice on its job, leaves a quote alone, and searches for invoices with PDFs", async () => {
    const r = await si.scanInvoices();
    expect(r).toMatchObject({ ran: true, filed: 1, queued: 0, ignored: 1 });
    expect(lastQuery).toContain("has:attachment filename:pdf");
    const costs = await sql`select c.description, c.amount, c.kind::text, c.date, j.number from costs c join jobs j on j.id = c.job_id`;
    expect(costs.map((c) => ({ ...c }))).toEqual([{ description: "CEF invoice 9001", amount: 412.5, kind: "Supplier invoice", date: "2026-11-20", number: 552 }]);
  });

  it("doesn't run again within 30 minutes unless asked, and never reads an email twice", async () => {
    expect(await si.scanInvoices()).toMatchObject({ ran: false, message: "Checked recently." });
    const again = await si.scanInvoices({ force: true });
    expect(again).toMatchObject({ ran: true, filed: 0, queued: 0, ignored: 0 });
  });

  it("files a credit note as a minus, and queues an invoice with no job number for a person", async () => {
    listed = ["m3", "m1", "m2"];
    const r = await si.scanInvoices({ force: true });
    expect(r).toMatchObject({ filed: 1, queued: 1 });
    const [cn] = await sql`select c.amount, j.number from costs c join jobs j on j.id = c.job_id where c.description = 'CEF credit note CN1'`;
    expect(cn).toMatchObject({ amount: -30, number: 557 });
    const q = await si.queuedInvoices();
    expect(q.map((x) => [x.invoice_number, x.reason])).toEqual([["9002", 'No job number found in the order reference "Van stock".']]);
  });

  it("lets a person put a queued invoice on a job, or mark it not a job cost", async () => {
    const [q] = await si.queuedInvoices();
    await expect(si.fileInvoice(q.id, "999", 100, { email: "office@battelectrical.com" })).rejects.toThrow("There's no job 999.");
    const job = await si.fileInvoice(q.id, "557", 100, { email: "office@battelectrical.com" });
    expect(job.number).toBe(557);
    expect(await si.queuedInvoices()).toEqual([]);
    await expect(si.fileInvoice(q.id, "557", 100, { email: "office@battelectrical.com" })).rejects.toThrow("already been dealt with");
    const filed = await si.recentlyFiled();
    expect(filed.map((f) => [f.invoice_number, f.job_number, f.decided_by])).toEqual([
      ["9002", 557, "office@battelectrical.com"],
      ["CN1", 557, "automatic"],
      ["9001", 552, "automatic"],
    ]);
  });

  it("won't file the same invoice twice if it's emailed again", async () => {
    mails.m4 = { subject: "Copy invoice 9001", pdfs: [["9001-copy.pdf", "pdf-9001"]] };
    listed = ["m4"];
    const r = await si.scanInvoices({ force: true });
    expect(r).toMatchObject({ filed: 0, ignored: 1 });
    const [{ n }] = await sql`select count(*)::int as n from costs where description = 'CEF invoice 9001'`;
    expect(n).toBe(1);
  });
});
