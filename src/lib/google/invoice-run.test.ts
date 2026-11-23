/**
 * Making invoices end to end, against a throwaway database and a pretend Google: numbering with no gaps,
 * quarter folders, the ledger row, test mode kept apart, marking sent and paid, and the job's money.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The template passes are tested on their own; here the document is a stand-in.
let pages = 1;
vi.mock("../docs", async (orig) => ({ ...(await orig<typeof import("../docs")>()), leftoverPlaceholders: () => [], pdfPageCount: () => pages }));
vi.mock("../invoice-doc", () => ({ checkInvoiceDoc: () => [], invoiceStructurePass: () => [], invoiceTextPass: () => [] }));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = { email: "office@battelectrical.com", name: "Office" };
const LEDGER = "1IFRTQz-rsTclYKGRVZxC0CjVO1769ByCXLc9msEaJBY";
const ROOT = "1M7EMynAWErpUv-FL7Zp1JIzJGgY48D7B";

type F = { id: string; name: string; parents: string[]; folder: boolean };

d("invoices", () => {
  let sql: ReturnType<typeof postgres>;
  let run: typeof import("./invoice-run");
  const files: F[] = [{ id: "testLive", name: "TEST 01 - Live", parents: ["zz"], folder: true }, { id: "jobfolder", name: "559 – A – B", parents: ["1nO9zd2wLMahtVCg4WKx9wxuCN7dK5R98"], folder: true }, { id: "q01", name: "01 - Quote & Contract", parents: ["jobfolder"], folder: true }];
  const sheets: Record<string, Record<string, string>> = { [LEDGER]: { A2: "INV-545", B2_howto: "INV-546" } };
  const writes: { sheet: string; range: string; values: unknown[] }[] = [];
  const cisRows: Record<string, string[][]> = {};
  const uploads: { name: string; parent: string }[] = [];
  let n = 0;
  let failCopy = false;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fakeGoogle = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method ?? "GET";
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    if (u.pathname === "/drive/v3/files" && method === "GET") {
      const parent = u.searchParams.get("q")!.match(/'([^']+)' in parents/)![1];
      return json({ files: files.filter((f) => f.parents[0] === parent).map((f) => ({ ...f, mimeType: f.folder ? "application/vnd.google-apps.folder" : "x" })) });
    }
    if (u.pathname === "/drive/v3/files" && method === "POST") {
      const f = { id: `f${++n}`, name: body.name, parents: body.parents, folder: true };
      files.push(f);
      return json(f);
    }
    const copy = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/copy$/);
    if (copy) {
      if (failCopy && copy[1] !== LEDGER) return json({ error: { message: "Drive is down" } }, 500);
      const id = `c${++n}`;
      files.push({ id, name: body.name, parents: body.parents, folder: false });
      if (copy[1] === LEDGER) sheets[id] = { A2: "INV-545" };
      return json({ id, webViewLink: `https://docs/${id}` });
    }
    const file = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (file) return json(files.find((f) => f.id === file[1]) ?? { id: file[1], parents: [] });
    if (u.pathname.match(/\/export$/)) return new Response("%PDF", { status: 200 });
    if (u.pathname === "/upload/drive/v3/files") {
      const meta = JSON.parse(String(Buffer.from(init!.body as Buffer).toString("utf8")).split("\r\n\r\n")[1].split("\r\n")[0]);
      uploads.push({ name: meta.name, parent: meta.parents[0] });
      return json({ id: `p${++n}`, webViewLink: `https://pdf/${n}` });
    }
    if (u.hostname === "docs.googleapis.com") return json(u.pathname.endsWith(":batchUpdate") ? {} : { body: { content: [] } });
    const vals = u.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/(.+)$/);
    if (vals && method === "GET") {
      const range = decodeURIComponent(vals[2]);
      const s = sheets[vals[1]] ?? {};
      if (range === "'How to use'!B2") return json({ values: s.B2_howto ? [[s.B2_howto]] : [] });
      const col = Object.keys(s).filter((k) => /^A\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      if (range === "Invoices!A2:A501") return json({ values: col.map((k) => [s[k]]) });
      // The CIS Received tab: rows kept as written.
      if (range.startsWith("'CIS Received'!")) return json({ values: cisRows[vals[1]] ?? [] });
      const one = range.match(/^Invoices!A(\d+)$/);
      if (one) return json({ values: [[s[`A${one[1]}`] ?? ""]] });
    }
    if (vals && method === "PUT") {
      writes.push({ sheet: vals[1], range: decodeURIComponent(vals[2]), values: body.values[0] });
      return json({});
    }
    const bu = u.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values:batchUpdate$/);
    if (bu) {
      for (const dta of body.data) {
        writes.push({ sheet: bu[1], range: dta.range, values: dta.values[0] });
        const a = String(dta.range).match(/^Invoices!A(\d+):J/);
        if (a) sheets[bu[1]][`A${a[1]}`] = dta.values[0][0];
        const c = String(dta.range).match(/^'CIS Received'!A(\d+):C/);
        if (c) (cisRows[bu[1]] ??= [])[Number(c[1]) - 2] = [...dta.values[0], "", "", "", "", "", "", "", "", ""];
      }
      return json({});
    }
    return json({ error: { message: `unexpected ${method} ${u.pathname}` } }, 500);
  };

  let jobId = "";
  const form = (o: Partial<import("./invoice-run").InvoiceForm> = {}): import("./invoice-run").InvoiceForm => ({
    type: "Deposit", stageLabel: "Deposit, on acceptance", vat: "Standard 20%", cis: false, cisLabour: null, invoiceDate: "2026-11-23", supplyDate: "2026-11-23",
    termsDays: 30, clientName: "Test Client", clientEmail: "a@example.com", billingAddress: "1 Road\nTown\nHP1 1AA", site: "12 Test Lane",
    lines: [{ description: "Deposit (25%) for works per quotation 559", qty: 1, unit: 1825 }], notes: "", ...o,
  });

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
    run = await import("./invoice-run");
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(ME.email, "r", client.GOOGLE_SCOPES.join(" "));
    await sql`update settings set value = jsonb_set(value, '{test,folders,Live}', '"testLive"') where key = 'google'`;
    const [c] = await sql`insert into clients (name) values ('Test Client') returning id`;
    const [j] = await sql`insert into jobs (number, stage, site, client_id, quote_value, drive_folder_id) values (559, 'Booked', '12 Test Lane', ${c.id}, 7300, 'jobfolder') returning id`;
    jobId = j.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("in test mode: TEST-INV numbers, a test folder and a copy of the ledger; the real ledger isn't touched", async () => {
    const r = await run.makeInvoice(jobId, form(), ME);
    expect(r).toMatchObject({ ok: true, label: "TEST-INV-1" });
    const folder = files.find((f) => f.name === "Invoices (TEST)")!;
    expect(folder.parents).toEqual(["zz"]);
    const quarter = files.find((f) => f.name === "VAT Qtr to 31 Dec 2026")!;
    expect(quarter.parents).toEqual([folder.id]);
    expect(files.filter((f) => f.parents[0] === quarter.id).map((f) => f.name)).toHaveLength(5);
    expect(writes.every((w) => w.sheet !== LEDGER)).toBe(true);
    expect(writes[0]).toMatchObject({ range: "Invoices!A3:J3", values: ["TEST-INV-1", "23/11/2026", "23/11/2026", "Test Client", "a@example.com", "#559", "12 Test Lane", "Deposit", "Standard 20%", 1825] });
    // The real job folder isn't written to in test mode.
    expect(uploads.map((u) => u.parent)).not.toContain("q01");
    // Test invoices don't change the job's money.
    const job = (await (await import("../data")).findJob("559"))!;
    expect(job.money.income).toBe(7300);
  });

  it("live: numbers on from the ledger, files in the real quarter folder and the job's 01 folder, writes the ledger", async () => {
    await sql`update settings set value = jsonb_set(value, '{mode}', '"live"') where key = 'google'`;
    writes.length = 0;
    const r = await run.makeInvoice(jobId, form(), ME);
    expect(r).toMatchObject({ ok: true, label: "INV-546" });
    expect(files.find((f) => f.name === "VAT Qtr to 31 Dec 2026" && f.parents[0] === ROOT)).toBeTruthy();
    expect(uploads.slice(-2).map((u) => u.name)).toEqual(["INV-546 – Test Client – 12 Test Lane.pdf", "INV-546 – Test Client – 12 Test Lane.pdf"]);
    expect(uploads.at(-1)!.parent).toBe("q01");
    expect(writes.map((w) => [w.sheet, w.range])).toEqual([[LEDGER, "Invoices!A3:J3"], [LEDGER, "Invoices!P3"], [LEDGER, "Invoices!AA3:AB3"]]);
    const [j] = await sql`select notes, stage from jobs where id = ${jobId}`;
    expect(j.notes).toContain("INV-546 for £2190.00 inc VAT raised (deposit, deposit, on acceptance).");
    expect(j.stage).toBe("Booked");
  });

  it("never leaves a gap: a failed invoice's number goes to the next one", async () => {
    failCopy = true;
    const bad = await run.makeInvoice(jobId, form(), ME);
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("Its number will be used for the next one");
    failCopy = false;
    const good = await run.makeInvoice(jobId, form({ type: "Stage payment", stageLabel: "Completion of first fix", lines: [{ description: "First fix", qty: 1, unit: 2555 }] }), ME);
    expect(good.label).toBe("INV-547");
    const nums = await sql`select number, status from invoices where not test order by number`;
    expect(nums.map((x) => [x.number, x.status])).toEqual([[546, "made"], [547, "made"]]);
  });

  it("a CIS invoice goes in 02 - CIS Invoices with the labour in column M", async () => {
    writes.length = 0;
    const r = await run.makeInvoice(jobId, form({ type: "Stage payment", stageLabel: "Completion of second fix", vat: "Reverse charge", cis: true, cisLabour: 1500, lines: [{ description: "Second fix", qty: 1, unit: 2190 }] }), ME);
    expect(r).toMatchObject({ ok: true, label: "INV-548" });
    expect(r.message).toContain("£1,890.00 payable after CIS");
    expect(writes.find((w) => w.range === "Invoices!M5")!.values).toEqual([1500]);
    // And its CIS Received row: invoice, contractor, email, labour.
    expect(writes.find((w) => w.range === "'CIS Received'!A2:C2")!.values).toEqual(["INV-548", "Test Client", "a@example.com"]);
    expect(writes.find((w) => w.range === "'CIS Received'!F2")!.values).toEqual([1500]);
    const [i] = await sql`select gross, payable, cis_deduction from invoices where number = 548`;
    expect(i).toMatchObject({ gross: 2190, payable: 1890, cis_deduction: 300 });
  });

  it("an invoice that isn't one page isn't saved", async () => {
    pages = 2;
    const r = await run.makeInvoice(jobId, form(), ME);
    expect(r.message).toContain("came out at 2 pages");
    pages = 1;
  });

  it("final invoice: the job moves to Invoiced, income becomes what's invoiced, and paying it makes the job Paid", async () => {
    const r = await run.makeInvoice(jobId, form({ type: "Final", stageLabel: "Testing, certification and handover", supplyDate: "2026-12-01", lines: [{ description: "Balance", qty: 1, unit: 730 }] }), ME);
    expect(r.ok).toBe(true);
    let [j] = await sql`select stage from jobs where id = ${jobId}`;
    expect(j.stage).toBe("Invoiced");
    const job = (await (await import("../data")).findJob("559"))!;
    expect(job.money.income).toBe(1825 + 2555 + 2190 + 730);
    const ids = await sql`select id, number from invoices where not test and status = 'made' order by number`;
    writes.length = 0;
    for (const x of ids.slice(0, -1)) await run.markInvoice(x.id, "paid", "2026-12-10", ME);
    expect(writes[0]).toMatchObject({ range: "Invoices!S3", values: ["10/12/2026"] });
    // Paying the CIS invoice (INV-548) fills its Paid Date on CIS Received too.
    expect(writes.find((w) => w.range === "'CIS Received'!D2")!.values).toEqual(["10/12/2026"]);
    const last = await run.markInvoice(ids.at(-1)!.id, "paid", "2026-12-12", ME);
    expect(last).toContain("The job is now Paid");
    [j] = await sql`select stage from jobs where id = ${jobId}`;
    expect(j.stage).toBe("Paid");
  });
});
