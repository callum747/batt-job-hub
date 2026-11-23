/**
 * The Invoices page against a pretend ledger and Gmail: chasing fills Last Chased, a payment that doesn't match
 * isn't marked paid, and a hand-raised invoice gets its Paid Date. Runs only when TEST_DATABASE_URL is set.
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
const row545 = ["INV-545", "12/11/2026", "12/11/2026", "Test Co", "accounts@example.com", "Q-549", "Unit 2", "Survey", "Standard 20%", "£506.80", "£101.36", "£608.16", "", "", "£608.16", "30", "12/12/2026", "12/11/2026", "", "Overdue", "9", "£30.41", "", "19/12/2026", "31/12/2026", "VAT", "https://drive.google.com/file/d/1VpGNMhVav_Su3Aml6L040wcv46Rf1GDQ/view", ""];

d("the Invoices page", () => {
  let sql: ReturnType<typeof postgres>;
  let lr: typeof import("./ledger-run");
  const writes: { range: string; value: string }[] = [];
  let drafted: string | null = null;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fakeGoogle = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method ?? "GET";
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    if (u.pathname === `/v4/spreadsheets/${LEDGER}/values/${encodeURIComponent("Invoices!A2:AB501")}`) return json({ values: [row545] });
    const put = u.pathname.match(/^\/v4\/spreadsheets\/[^/]+\/values\/(.+)$/);
    if (put && method === "PUT") {
      writes.push({ range: decodeURIComponent(put[1]), value: JSON.parse(String(init!.body)).values[0][0] });
      return json({});
    }
    if (u.pathname === "/drive/v3/files/1VpGNMhVav_Su3Aml6L040wcv46Rf1GDQ") return new Response("%PDF-545", { status: 200 });
    if (u.pathname === "/gmail/v1/users/me/drafts") {
      drafted = Buffer.from(JSON.parse(String(init!.body)).message.raw, "base64url").toString("utf8");
      return json({ id: "d1", message: { id: "m1" } });
    }
    return json({ error: { message: `unexpected ${method} ${u.pathname}${u.search}` } }, 500);
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
    lr = await import("./ledger-run");
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(ME.email, "r", client.GOOGLE_SCOPES.join(" "));
    await sql`update settings set value = jsonb_set(value, '{mode}', '"live"') where key = 'google'`;
    await sql`insert into clients (name, contact) values ('Test Co', 'Sam Smith')`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("reads the ledger", async () => {
    const { test, invoices } = await lr.readLedger(ME.email);
    expect(test).toBe(false);
    expect(invoices.map((i) => [i.number, i.status, i.payable])).toEqual([["INV-545", "Overdue", 608.16]]);
  });

  it("drafts the week-overdue chaser with the invoice attached, and fills Last Chased", async () => {
    const start = await lr.chaserStart(ME.email, "INV-545");
    expect(start).toMatchObject({ to: "accounts@example.com", subject: "Invoice INV-545: overdue", stage: 2, attach: true });
    expect(start.body).toMatch(/^Hi Sam,/);
    const r = await lr.draftChaser(ME, "INV-545", start);
    expect(r.attached).toBe(true);
    expect(drafted).toContain(Buffer.from("%PDF-545").toString("base64"));
    expect(writes.at(-1)!.range).toBe("Invoices!W2");
    expect(writes.at(-1)!.value).toMatch(/^\d\d\/\d\d\/\d{4}$/);
  });

  it("won't mark it paid when the amount received doesn't match", async () => {
    await expect(lr.recordPayment(ME, "INV-545", "2026-12-20", 500)).rejects.toThrow("is for £608.16 but £500.00 was received");
    expect(writes.some((w) => w.range.startsWith("Invoices!S"))).toBe(false);
  });

  it("marks a hand-raised invoice paid in the ledger", async () => {
    await lr.recordPayment(ME, "INV-545", "2026-12-20", 608.16);
    expect(writes.at(-1)).toEqual({ range: "Invoices!S2", value: "20/12/2026" });
  });

  it("says plainly when an invoice isn't in the ledger", async () => {
    await expect(lr.chaserStart(ME.email, "INV-999")).rejects.toThrow("INV-999 isn't in the ledger.");
  });
});
