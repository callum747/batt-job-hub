/**
 * Job numbers against a real database. Runs only when TEST_DATABASE_URL points at a
 * throwaway database (it creates and empties its own tables). Never point it at live data.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("job numbers in the database", () => {
  let sql: ReturnType<typeof postgres>;
  let mod: typeof import("./mutations");

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    mod = await import("./mutations");
    sql = (await import("./db")).sql;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("numbers a job when it's quoted, as the highest plus one", async () => {
    await sql`insert into jobs (number, stage) values (556, 'Booked')`;
    await sql`insert into jobs (number, stage, also) values (555, 'Complete', '{553}')`;
    const [j] = await sql`insert into jobs (stage) values ('Enquiry') returning id`;
    const r = await mod.changeStage(j.id, "Draft quote", "test");
    expect(r.number).toBe(557);
  });

  it("keeps an existing number when the stage changes again", async () => {
    const [j] = await sql`select id from jobs where number = 557`;
    const r = await mod.changeStage(j.id, "Quoted", "test");
    expect(r.number).toBe(557);
  });

  it("doesn't number an enquiry that's lost", async () => {
    const [j] = await sql`insert into jobs (stage) values ('Enquiry') returning id`;
    const r = await mod.changeStage(j.id, "Lost", "test");
    expect(r.number).toBeNull();
  });

  it("never gives two jobs the same number, even at the same moment", async () => {
    const ids = await sql`insert into jobs (stage) select 'Enquiry' from generate_series(1, 12) returning id`;
    const results = await Promise.all(ids.map((r) => mod.changeStage(r.id, "Draft quote", "test")));
    const numbers = results.map((r) => r.number).sort((a, b) => a! - b!);
    expect(new Set(numbers).size).toBe(12);
    expect(numbers[0]).toBe(558);
    expect(numbers[11]).toBe(569);
  });

  it("skips numbers that were merged into another job", async () => {
    await sql`update jobs set also = '{570}' where number = 556`;
    const [j] = await sql`insert into jobs (stage) values ('Enquiry') returning id`;
    const r = await mod.changeStage(j.id, "Booked", "test");
    expect(r.number).toBe(571);
  });

  it("refuses to change a job that was merged into another", async () => {
    const [keep] = await sql`select id from jobs where number = 556`;
    const [gone] = await sql`insert into jobs (stage, merged_into) values ('Closed', ${keep.id}) returning id`;
    await expect(mod.changeStage(gone.id, "Booked", "test")).rejects.toThrow(/merged/);
  });
});
