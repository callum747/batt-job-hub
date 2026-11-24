/**
 * Pricing a job straight from lines and drafting its quote from them. Throwaway database; Drive is faked.
 * Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./drive", () => ({ syncJobFolder: vi.fn(async () => ""), getFile: vi.fn(), listChildren: vi.fn(async () => []) }));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = { email: "office@battelectrical.com", name: "Office" };

const input = {
  lines: [
    { kind: "labour" as const, section: "Labour", description: "Installation engineer, 1 day at £380", qty: 1, rate: 380, days: 1 },
    { kind: "travel" as const, section: "Travel", description: "131 miles round trip (65.5 miles each way) from our Aylesbury registered office, at 45p per mile", qty: 131, rate: 0.45 },
    { kind: "materials" as const, section: "Materials", description: "4 adaptable boxes", qty: 1, rate: 56.68 },
    { kind: "materials" as const, section: "Materials", description: "Wago connectors, free of charge", qty: 1, rate: 0 },
  ],
  schedule: [{ area: "Plant room", items: [{ item: "Meter enclosures", ref: "4", works: "Fit four adaptable boxes and terminate the meter tails" }] }],
  miles: 131, people: 1, vans: 1, note: "Meterz day rate.",
};

d("pricing from lines", () => {
  let sql: ReturnType<typeof postgres>;
  let jobId = "";

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    process.env.NEXTAUTH_SECRET = "test-secret";
    sql = (await import("../db")).sql;
    const [c] = await sql`insert into clients (name, payment_days, notes) values ('Meterz', 30, 'No deposit.') returning id`;
    const [j] = await sql`insert into jobs (client_id, site, postcode, stage, description) values (${c.id}, '2 Stratford Place', 'W1C 1AA', 'Enquiry', 'Fit meter enclosures.') returning id`;
    jobId = j.id;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("adds the lines up, numbers the job and saves them as written", async () => {
    const { priceDirect } = await import("./pricing-run");
    const r = await priceDirect(jobId, input, ME);
    expect(r).toMatchObject({ ok: true, message: "Priced at £495.63 ex VAT (£594.76 inc VAT) from 4 lines." });
    expect(r.number).toBeGreaterThan(0);
    const [job] = await sql`select quote_value::float as v, miles_round_trip::float as m, stage, pricing from jobs where id = ${jobId}`;
    expect(job).toMatchObject({ v: 495.63, m: 131, stage: "Draft quote" });
    expect(job.pricing).toMatchObject({ sheetUrl: "", direct: { marginKnown: false }, result: { sellExVat: 495.63, vat: 99.13, sellIncVat: 594.76, labourSell: 380, prelimsSell: 58.95, materialsSell: 56.68 } });
    const lines = await sql`select kind, description, detail, amount::float as amount from quote_lines where job_id = ${jobId} order by position`;
    expect(lines.map((l) => [l.kind, l.description, l.amount])).toEqual([
      ["direct", "Installation engineer, 1 day at £380", 380],
      ["prelims", "Travel", 58.95],
      ["direct", "4 adaptable boxes", 56.68],
      ["direct", "Wago connectors, free of charge", 0],
    ]);
  });

  it("drafts the quote from those lines exactly, with the schedule written with them", async () => {
    const { findJob, jobDetail, getClient } = await import("../data");
    const { draftShortQuote, isPriced } = await import("../quote-drafts");
    const { checkShortQuote } = await import("../quote-short");
    const job = (await findJob(jobId))!;
    expect(isPriced(job)).toBe(true);
    if (!isPriced(job)) return;
    const q = draftShortQuote(job, (await jobDetail(job.id)).lines, await getClient(job.client_id!), { name: "Office", title: "Project Manager", email: ME.email });
    expect(q.investment).toEqual([
      { section: "Labour", description: "Installation engineer, 1 day at £380", amount: 380 },
      { section: "Travel and site costs", description: "131 miles round trip (65.5 miles each way) from our Aylesbury registered office, at 45p per mile", amount: 58.95 },
      { section: "Materials", description: "4 adaptable boxes", amount: 56.68 },
      { section: "Materials", description: "Wago connectors, free of charge", amount: 0 },
    ]);
    expect(q).toMatchObject({ subtotal: 495.63, total: 594.76, deposit: false, paymentDays: 30, schedule: input.schedule });
    expect(checkShortQuote(q)).toEqual([]);
  });

  it("knows the margin only when every cost is given, and refuses nonsense", async () => {
    const { directResult, checkDirect } = await import("../direct-pricing");
    const costed = { ...input, lines: input.lines.map((l) => (l.kind === "travel" ? l : { ...l, cost: l.kind === "labour" ? 250 : 49.29 * (l.rate ? 1 : 0) })) };
    expect(directResult(costed, 20, 18)).toMatchObject({ marginKnown: true, result: { netProfit: 137.39, netMargin: 27.7, labourHours: 8, siteDays: 1 } });
    expect(checkDirect({ ...input, lines: [{ ...input.lines[0], qty: 0 }], schedule: [] })).toEqual([
      "Line 1: the quantity must be more than 0.",
      "The schedule of works needs at least one area, and every line needs the item and the works.",
    ]);
  });
});
