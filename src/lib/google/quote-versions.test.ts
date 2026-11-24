/** Old "#557/3" quote names become plain "#557" in Drive and on the job. Throwaway database; Drive is faked. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const renamed: [string, string][] = [];
vi.mock("./client", () => ({
  googleSettings: async () => ({ mode: "test" }),
  google: vi.fn(async (_e: string, p: string, o: { body?: { name?: string } } = {}) => {
    const id = p.split("/").pop()!;
    if (id === "gone") throw new Error("not found");
    renamed.push([id, o.body?.name ?? ""]);
    return { id };
  }),
}));
vi.mock("./drive", () => ({ listChildren: vi.fn(async () => []) }));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("taking quote versions off names", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    sql = (await import("../db")).sql;
    const [j] = await sql`insert into jobs (number, stage, site) values (557, 'Draft quote', 'Oaken Grove') returning id`;
    await sql`insert into documents (job_id, kind, revision, name, doc_id, url, pdf_file_id) values
      (${j.id}, 'quote', 3, '#557/3 – Oaken Grove – Quote', 'doc3', 'u', 'pdf3'),
      (${j.id}, 'quote', 4, '#557/4 – Oaken Grove – Quote', 'gone', 'u', ''),
      (${j.id}, 'quote', 6, '#557 – Oaken Grove – Quote', 'doc6', 'u', 'pdf6'),
      (${j.id}, 'pricing', 1, '#557 – Oaken Grove – Pricing', 'sheet', 'u', '')`;
  });
  afterAll(async () => {
    await sql?.end();
  });

  it("renames the Doc and its PDF, puts the job's record right even if the file has gone, and then has nothing left to do", async () => {
    const { dropQuoteVersions } = await import("./drive-rename");
    expect(await dropQuoteVersions("office@battelectrical.com")).toBe(2);
    expect(renamed).toEqual([["doc3", "#557 – Oaken Grove – Quote"], ["pdf3", "#557 – Oaken Grove – Quote.pdf"]]);
    expect((await sql`select name from documents order by revision, kind`).map((r) => r.name)).toEqual(["#557 – Oaken Grove – Pricing", "#557 – Oaken Grove – Quote", "#557 – Oaken Grove – Quote", "#557 – Oaken Grove – Quote"]);
    expect(await dropQuoteVersions("office@battelectrical.com")).toBe(0);
  });
});
