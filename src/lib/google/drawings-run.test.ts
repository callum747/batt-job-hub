/** Counting drawings against a pretend Drive and assistant. Runs only when TEST_DATABASE_URL is set. It wipes that database. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./pricing-run", () => ({
  loadPriceList: async () => ({ products: [{ key: "Double socket | Click | White Plastic", label: "Double socket", section: "Power & Data", materials: 4, hours: 0.75 }], fetchedAt: "" }),
}));

const ai: { reply: string; stop: string; sent: { docs: string[]; text: string } | null } = { reply: "", stop: "end_turn", sent: null };
vi.mock("../assistant/client", () => ({
  MODEL: "test-model",
  assistantConfigured: () => true,
  explainAiError: (e: unknown) => String(e instanceof Error ? e.message : e),
  anthropic: () => ({
    messages: {
      stream: (p: { messages: { content: { type: string; title?: string; text?: string }[] }[] }) => {
        const c = p.messages[0].content;
        ai.sent = { docs: c.filter((b) => b.type === "document").map((b) => b.title!), text: c.find((b) => b.type === "text")!.text! };
        return { finalMessage: async () => ({ stop_reason: ai.stop, content: [{ type: "text", text: ai.reply }] }) };
      },
    },
  }),
}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = { email: "office@battelectrical.com", name: "Office" };
const F = "application/vnd.google-apps.folder";

d("counting drawings", () => {
  let sql: ReturnType<typeof postgres>;
  let run: typeof import("./drawings-run");
  let jobId = "";
  const files = [
    { id: "d02", name: "02 - Drawings & Specs", mimeType: F, parent: "job" },
    { id: "d01", name: "01 - Quote & Contract", mimeType: F, parent: "job" },
    { id: "arch", name: "Architectural", mimeType: F, parent: "d02" },
    { id: "elec", name: "Electrical", mimeType: F, parent: "d02" },
    { id: "p1", name: "81_001_Proposed Small Power & Lighting Layout_Ground (P01).pdf", mimeType: "application/pdf", parent: "elec", size: "229326" },
    { id: "p2", name: "11_002_Proposed Ground Floor Plan (P01).pdf", mimeType: "application/pdf", parent: "arch", size: "193027" },
    { id: "p3", name: "#559 – Quote.pdf", mimeType: "application/pdf", parent: "d01", size: "418553" },
    { id: "big", name: "E-900 Lighting.pdf", mimeType: "application/pdf", parent: "elec", size: String(25 * 1024 * 1024) },
  ];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const fakeGoogle = async (input: string | URL | Request) => {
    const u = new URL(String(input));
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    if (u.pathname === "/drive/v3/files") {
      const parents = [...u.searchParams.get("q")!.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      return json({ files: files.filter((f) => parents.includes(f.parent)).map((f) => ({ ...f, parents: [f.parent] })) });
    }
    if (u.pathname.startsWith("/drive/v3/files/")) return new Response("%PDF-drawing", { status: 200 });
    return json({});
  };
  const good = { drawings_read: ["81_001"], legend: [{ symbol: "double circle", meaning: "Double socket" }], rooms: [{ floor: "Ground", room: "Kitchen", items: [{ description: "Double socket", qty: 6, key: "Double socket | Click | White Plastic", confidence: "high", note: "" }] }], not_counted: ["Consumer unit"], questions: [] };

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
    run = await import("./drawings-run");
    sql = (await import("../db")).sql;
    await client.saveRefreshToken(ME.email, "r", client.GOOGLE_SCOPES.join(" "));
    const [j] = await sql`insert into jobs (number, stage, site, description, drive_folder_id) values (559, 'Draft quote', 'Brook House', 'Refurb', 'job') returning id`;
    jobId = j.id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql?.end();
  });

  it("finds PDFs in nested folders, drawings first, with the electrical ones marked", async () => {
    const list = await run.listDrawingPdfs(ME.email, "job");
    expect(list.map((f) => [f.id, f.folder, f.electrical])).toEqual([
      ["p1", "02 - Drawings & Specs › Electrical", true],
      ["big", "02 - Drawings & Specs › Electrical", true],
      ["p2", "02 - Drawings & Specs › Architectural", false],
      ["p3", "01 - Quote & Contract", false],
    ]);
    expect(list[0].sizeKb).toBe(224);
  });

  it("sends the chosen drawings and the price list, and saves the count on the job", async () => {
    ai.reply = JSON.stringify(good);
    const r = await run.countDrawings(jobId, ["p1", "p2"], ME);
    expect(r.ok).toBe(true);
    expect(ai.sent!.docs).toEqual(["81_001_Proposed Small Power & Lighting Layout_Ground (P01).pdf", "11_002_Proposed Ground Floor Plan (P01).pdf"]);
    expect(ai.sent!.text).toContain("Double socket | Click | White Plastic  [Power & Data]");
    const [j] = await sql`select drawing_count from jobs where id = ${jobId}`;
    expect(j.drawing_count.count.rooms[0].items[0].qty).toBe(6);
    expect(j.drawing_count.files.map((f: { name: string }) => f.name)).toHaveLength(2);
    expect(j.drawing_count.by).toBe("Office");
  });

  it("refuses too much at once, nothing ticked, and an answer it can't read, without saving", async () => {
    expect(await run.countDrawings(jobId, [], ME)).toEqual({ ok: false, message: "Tick at least one drawing." });
    const big = await run.countDrawings(jobId, ["big"], ME);
    expect(big.ok === false && big.message).toContain("the limit is 20 MB");
    ai.reply = "not json";
    const bad = await run.countDrawings(jobId, ["p1"], ME);
    expect(bad.ok === false && bad.message).toContain("couldn't read those drawings");
    ai.reply = JSON.stringify({ ...good, rooms: [{ room: "Kitchen" }] });
    expect((await run.countDrawings(jobId, ["p1"], ME)).ok).toBe(false);
    ai.stop = "max_tokens";
    const long = await run.countDrawings(jobId, ["p1"], ME);
    expect(long.ok === false && long.message).toContain("too long to finish");
    const [j] = await sql`select drawing_count from jobs where id = ${jobId}`;
    expect(j.drawing_count.count.rooms[0].items[0].qty).toBe(6);
  });
});
