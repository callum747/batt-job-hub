/** Renaming Q- to # against a pretend Drive. Runs only when TEST_DATABASE_URL is set. It wipes that database. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = "office@battelectrical.com";
const LIVE = "1nO9zd2wLMahtVCg4WKx9wxuCN7dK5R98";
const DONE = "1afiMhq-Kke9STeVfrejvbbf87zEwHpy-";

d("renaming Q- to # in Drive", () => {
  let sql: ReturnType<typeof postgres>;
  const files = [
    { id: "a", name: "Q-552 – Meterz – CBRE", parent: "x", folder: true },
    { id: "b", name: "3 Grove Court, Q-518.pdf", parent: "x", folder: false },
    { id: "c", name: "Template Q-[000]", parent: "x", folder: false },
    { id: "d", name: "558 – David Marshall – EV Charger", parent: LIVE, folder: true },
    { id: "e", name: "558 – Pricing", parent: "d", folder: false },
    { id: "f", name: "01 - Quote & Contract", parent: "d", folder: true },
    { id: "g", name: "2026", parent: DONE, folder: true },
    { id: "h", name: "26-003 – Prism – 5 Vicarage Road", parent: "g", folder: true },
    { id: "locked", name: "Q-539 – Kenton.docx", parent: "x", folder: false },
  ];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fakeGoogle = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    const shape = (f: (typeof files)[number]) => ({ id: f.id, name: f.name, mimeType: f.folder ? "application/vnd.google-apps.folder" : "application/pdf" });
    if (u.pathname === "/drive/v3/files") {
      const q = u.searchParams.get("q")!;
      if (q.includes("name contains 'Q-'")) return json({ files: files.filter((f) => f.name.includes("Q-")).map(shape) });
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      return json({ files: files.filter((f) => parents.includes(f.parent) && (!q.includes("mimeType =") || f.folder)).map(shape) });
    }
    const id = u.pathname.match(/^\/drive\/v3\/files\/(\w+)$/)?.[1];
    if (id && init?.method === "PATCH") {
      if (id === "locked") return json({ error: { message: "The user does not have sufficient permissions" } }, 403);
      files.find((f) => f.id === id)!.name = JSON.parse(String(init.body)).name;
      return json({ id });
    }
    return json({ error: { message: "unexpected" } }, 500);
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
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(ME, "r", client.GOOGLE_SCOPES.join(" "));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("renames only what should change, reports what it couldn't, and is safe to run twice", async () => {
    const { renameToHash } = await import("./drive-rename");
    const r = await renameToHash(ME);
    expect(r.renamed).toBe(4);
    expect(r.left).toBe(0);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]).toContain("Q-539 – Kenton.docx");
    expect(Object.fromEntries(files.map((f) => [f.id, f.name]))).toEqual({
      a: "#552 – Meterz – CBRE", b: "3 Grove Court, #518.pdf", c: "Template Q-[000]", d: "#558 – David Marshall – EV Charger", e: "#558 – Pricing",
      f: "01 - Quote & Contract", g: "2026", h: "26-003 – Prism – 5 Vicarage Road", locked: "Q-539 – Kenton.docx",
    });
    const again = await renameToHash(ME);
    expect(again.renamed).toBe(0);
  });
});
