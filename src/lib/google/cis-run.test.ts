/**
 * CIS against a pretend ledger, Drive and Gmail: paying a subcontractor, asking a contractor for a missing
 * statement, and filing one. Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = { email: "office@battelectrical.com", name: "Office" };
const LEDGER = "1IFRTQz-rsTclYKGRVZxC0CjVO1769ByCXLc9msEaJBY";
const ROOT = "1M7EMynAWErpUv-FL7Zp1JIzJGgY48D7B";

d("CIS", () => {
  let sql: ReturnType<typeof postgres>;
  let cis: typeof import("./cis-run");
  const writes: { range: string; values: unknown[] }[] = [];
  const folders: { id: string; name: string; parent: string }[] = [];
  let drafted = "";
  let uploaded = "";
  let n = 0;
  const tabs: Record<string, string[][]> = {
    "CIS Received": [["INV-547", "Test Contractor Ltd", "acc@example.com", "20/11/2026", "05/12/2026", "£1,500.00", "£300.00", "19/12/2026", "", "", "31/12/2026", ""]],
    Subcontractors: [["Jed", "", "94633 65223", "", "20%", "[TBC]", "[TBC]", "Full legal name needed for statements."]],
    "CIS Paid (Subcontractors)": [],
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fakeGoogle = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method ?? "GET";
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    const get = u.pathname.match(/^\/v4\/spreadsheets\/[^/]+\/values\/(.+)$/);
    if (get && method === "GET") {
      const range = decodeURIComponent(get[1]);
      const tab = range.replace(/^'?([^'!]+)'?!.*$/, "$1");
      const rows = tabs[tab] ?? [];
      return json({ values: /!A2:A501$/.test(range) ? rows.map((r) => [r[0]]) : rows });
    }
    if (u.pathname.endsWith("values:batchUpdate")) {
      for (const x of JSON.parse(String(init!.body)).data) writes.push({ range: x.range, values: x.values[0] });
      return json({});
    }
    if (u.pathname === "/drive/v3/files" && method === "GET") {
      const parent = u.searchParams.get("q")!.match(/'([^']+)' in parents/)![1];
      return json({ files: folders.filter((f) => f.parent === parent).map((f) => ({ ...f, mimeType: "application/vnd.google-apps.folder" })) });
    }
    if (u.pathname === "/drive/v3/files" && method === "POST") {
      const b = JSON.parse(String(init!.body));
      const f = { id: `f${++n}`, name: b.name, parent: b.parents[0] };
      folders.push(f);
      return json(f);
    }
    if (u.pathname === "/upload/drive/v3/files") {
      uploaded = Buffer.from(init!.body as Buffer).toString("utf8").split("\r\n\r\n")[1].split("\r\n")[0];
      return json({ id: "pdf1", webViewLink: "https://drive/pdf1" });
    }
    if (u.pathname === "/gmail/v1/users/me/drafts") {
      drafted = Buffer.from(JSON.parse(String(init!.body)).message.raw, "base64url").toString("utf8");
      return json({ id: "d1", message: { id: "m1" } });
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
    cis = await import("./cis-run");
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(ME.email, "r", client.GOOGLE_SCOPES.join(" "));
    await sql`update settings set value = jsonb_set(value, '{mode}', '"live"') where key = 'google'`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("records a payment to Jed: 20% of the labour only, his UTR from the Subcontractors tab", async () => {
    const r = await cis.recordSubcontractorPayment(ME, { date: "2026-11-21", name: "jed", gross: 1000, materials: 200, notes: "Week ending 21/11" });
    expect(r).toMatchObject({ labour: 800, deducted: 160, net: 840, rate: 0.2, taxMonthEnding: "2026-12-05" });
    expect(writes.map((w) => [w.range, w.values])).toEqual([
      ["'CIS Paid (Subcontractors)'!A2:G2", ["21/11/2026", "Jed", "94633 65223", "", 0.2, 1000, 200]],
      ["'CIS Paid (Subcontractors)'!R2", ["Week ending 21/11"]],
    ]);
    await expect(cis.recordSubcontractorPayment(ME, { date: "2026-11-21", name: "Nobody", gross: 10, materials: 0, notes: "" })).rejects.toThrow("Nobody isn't on the ledger's Subcontractors tab.");
    await expect(cis.recordSubcontractorPayment(ME, { date: "2026-11-21", name: "Jed", gross: 100, materials: 200, notes: "" })).rejects.toThrow("can't be more than the gross");
  });

  it("asks a contractor for a statement that's overdue", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-22T12:00:00Z"));
    await cis.requestStatement(ME, "Test Contractor Ltd");
    vi.useRealTimers();
    expect(drafted).toContain("To: acc@example.com");
    expect(drafted).toContain("CIS payment and deduction statement");
  });

  it("files a statement in the quarter's 03 folder and records it", async () => {
    writes.length = 0;
    const link = await cis.fileStatement(ME, ["INV-547"], "2026-12-15", { name: "s.pdf", data: new Uint8Array([37, 80, 68, 70]) });
    expect(link).toBe("https://drive/pdf1");
    const quarter = folders.find((f) => f.name === "VAT Qtr to 31 Dec 2026" && f.parent === ROOT)!;
    expect(folders.filter((f) => f.parent === quarter.id)).toHaveLength(5);
    expect(uploaded).toContain('"name":"CIS Statement – Test Contractor Ltd – Tax month ending 5 Dec 2026.pdf"');
    expect(writes).toEqual([{ range: "'CIS Received'!I2:J2", values: ["15/12/2026", "https://drive/pdf1"] }]);
  });
});
